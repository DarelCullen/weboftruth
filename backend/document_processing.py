import io
import re
import logging
from typing import Dict, List, Set, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from pypdf import PdfReader
from docx import Document
from models import Node, Edge
from database import SessionLocal

logger = logging.getLogger(__name__)

# Lazy spaCy loader
_nlp = None

def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            try:
                _nlp = spacy.load("en_core_web_sm")
            except Exception:
                logger.info("Downloading en_core_web_sm model...")
                import spacy.cli
                spacy.cli.download("en_core_web_sm")
                _nlp = spacy.load("en_core_web_sm")
        except Exception as e:
            logger.error(f"Failed to load spaCy model: {e}")
            _nlp = None
    return _nlp

# Mapping spaCy entity labels to Web of Truth node types
ENTITY_TYPE_MAP = {
    "PERSON": "Person",
    "GPE": "Location",
    "LOC": "Location",
    "FAC": "Location",
    "ORG": "Organization",
    "NORP": "Organization",
    "EVENT": "Event",
    "WORK_OF_ART": "Work",
    "PRODUCT": "Technology",
    "LAW": "Work",
}

# Stopwords & noise tokens to filter out from entity recognition
FILTER_WORDS = {
    "the", "a", "an", "this", "that", "these", "those", "page", "section",
    "chapter", "figure", "table", "contents", "index", "author", "abstract",
    "introduction", "conclusion", "references", "appendix", "et al", "ibid",
    "op cit", "pdf", "http", "https", "www", "com", "org", "net", "edu",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday", "today", "yesterday",
    "tomorrow", "year", "years", "month", "months", "day", "days", "time",
    "none", "null", "true", "false", "undefined", "unknown", "item", "items"
}

def clean_entity_text(text: str) -> str:
    """Clean and normalize extracted entity text."""
    if not text:
        return ""
    # Strip whitespace, quotes, parentheses, brackets, trailing punctuation
    cleaned = text.strip()
    cleaned = re.sub(r"^[\s\'\"\‘\’\“\”\(\[\{\<\:\;\,\.\-\–\—]+", "", cleaned)
    cleaned = re.sub(r"[\s\'\"\‘\’\“\”\)\]\}\>\:\;\,\.\-\–\—]+$", "", cleaned)
    # Remove trailing possessive 's
    cleaned = re.sub(r"\'s$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\’s$", "", cleaned, flags=re.IGNORECASE)
    # Normalize multiple whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def is_valid_entity(cleaned_text: str, label: str) -> bool:
    """Determine whether an extracted entity should be included as a node."""
    if not cleaned_text or len(cleaned_text) < 2:
        return False
    # Filter purely numeric or punctuation
    if re.match(r"^[\d\W_]+$", cleaned_text):
        return False
    # Filter generic noisy words
    if cleaned_text.lower() in FILTER_WORDS:
        return False
    # Filter very long strings (likely parsing artifact or sentence fragment)
    if len(cleaned_text) > 80:
        return False
    # Filter labels not in our mapped categories
    if label not in ENTITY_TYPE_MAP:
        return False
    return True

def extract_text_from_file(filename: str, file_content: bytes) -> Tuple[str, Dict[str, any]]:
    """Extract full text and metadata from PDF, DOCX, or text files."""
    text = ""
    metadata = {"page_count": 1, "filename": filename}
    
    if filename.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(file_content))
            metadata["page_count"] = len(reader.pages)
            page_texts = []
            for idx, page in enumerate(reader.pages):
                page_str = page.extract_text() or ""
                # Normalize line breaks that break sentences awkwardly
                page_str = re.sub(r"(?<=\w)-\n(?=\w)", "", page_str)
                page_texts.append(page_str)
            text = "\n\n".join(page_texts)
        except Exception as e:
            logger.error(f"Error reading PDF {filename}: {e}")
            text = ""
    elif filename.lower().endswith(".docx"):
        try:
            doc = Document(io.BytesIO(file_content))
            paras = [p.text for p in doc.paragraphs if p.text]
            metadata["page_count"] = len(paras)
            text = "\n".join(paras)
        except Exception as e:
            logger.error(f"Error reading DOCX {filename}: {e}")
            text = ""
    else:
        try:
            text = file_content.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Error decoding text file {filename}: {e}")
            text = str(file_content)
            
    # Clean up whitespace
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    metadata["full_text_length"] = len(text)
    return text, metadata

def process_document(filename: str, file_content: bytes, db: Session) -> Node:
    """
    Process an uploaded document (PDF, DOCX, TXT):
    1. Extracts text and document metadata.
    2. Runs Named Entity Recognition (NER) to extract names, places, organizations, etc.
    3. Creates/updates Document Node.
    4. Creates/updates Entity Nodes.
    5. Creates 'mentions' edges from Document to Entities.
    6. Creates 'co_occurs_with' edges between entities appearing in the same context.
    """
    text, metadata = extract_text_from_file(filename, file_content)
    
    # 1. Create or retrieve the Document Node
    doc_node = db.query(Node).filter(Node.label == filename, Node.type == "Document").first()
    if not doc_node:
        doc_node = Node(
            label=filename,
            type="Document",
            properties={
                "filename": filename,
                "page_count": metadata.get("page_count", 1),
                "full_text_length": metadata.get("full_text_length", len(text)),
                "content_snippet": text[:500] if text else "",
            }
        )
        db.add(doc_node)
        db.commit()
        db.refresh(doc_node)
    else:
        # Update snippet & length
        props = dict(doc_node.properties or {})
        props["content_snippet"] = text[:500] if text else ""
        props["full_text_length"] = len(text)
        props["page_count"] = metadata.get("page_count", 1)
        doc_node.properties = props
        db.commit()
        db.refresh(doc_node)

    if not text.strip():
        return doc_node

    # 2. Run NLP Named Entity Recognition
    nlp = get_nlp()
    if not nlp:
        logger.warning("spaCy NLP engine is unavailable. Skipping entity extraction.")
        return doc_node

    # Process text in manageable chunks if text is very large
    max_chunk_size = 100000
    chunks = [text[i:i + max_chunk_size] for i in range(0, len(text), max_chunk_size)] if len(text) > max_chunk_size else [text]

    extracted_entities: Dict[str, Dict[str, any]] = {}
    sentence_entity_pairs: List[Tuple[str, str, str]] = [] # (ent1, ent2, sentence_snippet)

    for chunk in chunks:
        doc = nlp(chunk)
        
        for sent in doc.sents:
            sent_text = sent.text.strip()
            sent_snippet = (sent_text[:180] + "...") if len(sent_text) > 180 else sent_text
            sent_ents = []

            for ent in sent.ents:
                cleaned = clean_entity_text(ent.text)
                if is_valid_entity(cleaned, ent.label_):
                    mapped_type = ENTITY_TYPE_MAP.get(ent.label_, "Unknown")
                    
                    if cleaned not in extracted_entities:
                        extracted_entities[cleaned] = {
                            "label": cleaned,
                            "type": mapped_type,
                            "raw_label": ent.label_,
                            "count": 0,
                            "contexts": []
                        }
                    
                    extracted_entities[cleaned]["count"] += 1
                    if len(extracted_entities[cleaned]["contexts"]) < 3 and sent_snippet not in extracted_entities[cleaned]["contexts"]:
                        extracted_entities[cleaned]["contexts"].append(sent_snippet)
                    
                    sent_ents.append(cleaned)

            # Record co-occurrences of distinct entities in the same sentence
            unique_sent_ents = list(dict.fromkeys(sent_ents))
            for i in range(len(unique_sent_ents)):
                for j in range(i + 1, len(unique_sent_ents)):
                    e1, e2 = unique_sent_ents[i], unique_sent_ents[j]
                    if e1 != e2:
                        sentence_entity_pairs.append((e1, e2, sent_snippet))

    # 3. Create or reuse Entity Nodes in the Database
    created_or_found_nodes: Dict[str, Node] = {}
    type_counts: Dict[str, int] = {}

    for ent_name, ent_info in extracted_entities.items():
        node_type = ent_info["type"]
        type_counts[node_type] = type_counts.get(node_type, 0) + 1

        # Check if node already exists (case-insensitive search)
        existing_node = db.query(Node).filter(func.lower(Node.label) == ent_name.lower()).first()
        
        if existing_node:
            # Preserve existing node, update properties with source info
            props = dict(existing_node.properties or {})
            sources = list(props.get("sources", []))
            if filename not in sources:
                sources.append(filename)
            props["sources"] = sources
            if "context" not in props and ent_info["contexts"]:
                props["context"] = ent_info["contexts"][0]
            existing_node.properties = props
            db.commit()
            db.refresh(existing_node)
            created_or_found_nodes[ent_name] = existing_node
        else:
            new_node = Node(
                label=ent_name,
                type=node_type,
                properties={
                    "source_document": filename,
                    "sources": [filename],
                    "mention_count": ent_info["count"],
                    "context": ent_info["contexts"][0] if ent_info["contexts"] else "",
                    "ner_type": ent_info["raw_label"]
                }
            )
            db.add(new_node)
            try:
                db.commit()
                db.refresh(new_node)
                created_or_found_nodes[ent_name] = new_node
            except Exception as e:
                db.rollback()
                logger.error(f"Error creating node {ent_name}: {e}")
                existing = db.query(Node).filter(Node.label == ent_name).first()
                if existing:
                    created_or_found_nodes[ent_name] = existing

    # 4. Create 'mentions' edges from Document to each Entity
    for ent_name, ent_node in created_or_found_nodes.items():
        if ent_node.id == doc_node.id:
            continue
        
        edge_exists = db.query(Edge).filter(
            Edge.source_id == doc_node.id,
            Edge.target_id == ent_node.id,
            Edge.relation == "mentions"
        ).first()

        if not edge_exists:
            count = extracted_entities.get(ent_name, {}).get("count", 1)
            new_edge = Edge(
                source_id=doc_node.id,
                target_id=ent_node.id,
                relation="mentions",
                properties={
                    "explanation": f"Document '{filename}' mentions {ent_name} ({count} time{'s' if count > 1 else ''}).",
                    "mention_count": count,
                    "source_document": filename
                }
            )
            db.add(new_edge)

    # 5. Create 'co_occurs_with' edges between co-occurring entities
    added_pairs: Set[Tuple[int, int]] = set()
    for e1_name, e2_name, context_snip in sentence_entity_pairs:
        n1 = created_or_found_nodes.get(e1_name)
        n2 = created_or_found_nodes.get(e2_name)
        if not n1 or not n2 or n1.id == n2.id:
            continue

        pair_key = (min(n1.id, n2.id), max(n1.id, n2.id))
        if pair_key in added_pairs:
            continue
        added_pairs.add(pair_key)

        existing_edge = db.query(Edge).filter(
            ((Edge.source_id == n1.id) & (Edge.target_id == n2.id)) |
            ((Edge.source_id == n2.id) & (Edge.target_id == n1.id))
        ).first()

        if not existing_edge:
            co_edge = Edge(
                source_id=n1.id,
                target_id=n2.id,
                relation="co_occurs_with",
                properties={
                    "explanation": context_snip,
                    "context": context_snip,
                    "source_document": filename
                }
            )
            db.add(co_edge)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing edges: {e}")

    # 6. Update Document node properties with entity breakdown
    doc_props = dict(doc_node.properties or {})
    doc_props["entities_found"] = len(created_or_found_nodes)
    doc_props["entity_breakdown"] = type_counts
    doc_node.properties = doc_props
    db.commit()
    db.refresh(doc_node)

    return doc_node
