import wikipediaapi
from models import Node, Edge
from database import SessionLocal


# Create a Wikipedia object
# We must specify a user agent as per Wikipedia policy
wiki = wikipediaapi.Wikipedia(
    user_agent='WebOfTruth/1.0 (http://example.com/contact)',
    language='en'
)

from sqlalchemy.orm import Session

def get_or_create_node_from_page(page, db: Session) -> Node:
    """Helper to create a node with type and summary from a wiki page object"""
    # Check if node exists
    node = db.query(Node).filter(Node.label == page.title).first()
    if node:
        return node

    # Improved heuristic to infer type
    summary_lower = page.summary[:500].lower() # Check more context
    categories_lower = [c.lower() for c in page.categories.keys()]
    
    # Helper for whole word matching
    import re
    def has_word(text, words):
        pattern = r'\b(' + '|'.join(re.escape(w) for w in words) + r')\b'
        return re.search(pattern, text) is not None

    node_type = "WikipediaPage"
    
    # 1. Check Categories (High Confidence)
    if any("people" in c or "births" in c or "living" in c for c in categories_lower):
        node_type = "Person"
    elif any("companies" in c or "organizations" in c for c in categories_lower):
        node_type = "Organization"
    elif any("places" in c or "cities" in c or "countries" in c or "territories" in c for c in categories_lower):
        node_type = "Location"
    elif any("events" in c or "elections" in c or "battles" in c for c in categories_lower):
        node_type = "Event"
    elif any("software" in c or "computing" in c or "computer" in c or "technology" in c or "video games" in c for c in categories_lower):
        node_type = "Technology"
    elif any("films" in c or "books" in c or "albums" in c or "songs" in c for c in categories_lower):
        node_type = "Work"
    
    # 2. Key phrases in Summary (Fallback)
    if node_type == "WikipediaPage":
        if has_word(summary_lower, ["born", "politician", "actor", "actress", "singer", "player", "human"]):
            node_type = "Person"
        elif has_word(summary_lower, ["company", "corporation", "organization", "agency", "association", "inc."]):
            node_type = "Organization"
        elif has_word(summary_lower, ["city", "country", "state", "province", "located", "capital", "island", "river", "mountain"]):
            node_type = "Location"
        elif has_word(summary_lower, ["incident", "attack", "battle", "election", "ceremony", "war"]):
            node_type = "Event"
        elif has_word(summary_lower, ["software", "hardware", "computer", "app", "application", "device", "technology", "website"]):
            node_type = "Technology"
        elif has_word(summary_lower, ["film", "movie", "book", "novel", "album", "song", "series"]):
            node_type = "Work"

    node = Node(
        label=page.title,
        type=node_type,
        properties={"url": page.fullurl, "summary": page.summary[0:500]}
    )

    db.add(node)

    try:
        db.commit()
        db.refresh(node)
    except Exception:
        db.rollback()
        # In case of race condition
        node = db.query(Node).filter(Node.label == page.title).first()
    
    return node


import json
import re

def extract_relationship_explanation(page, target_title: str) -> str:
    """
    Extracts the most relevant context sentence from the Wikipedia page text
    that explains the relationship between the main page and the target entity.
    """
    try:
        text = (page.summary or "") + "\n\n" + (page.text or "")
        if not text.strip():
            return f"Referenced in Wikipedia article on '{page.title}'."

        # Clean Wikipedia footnote citations e.g. [1], [2], [note 1]
        cleaned_text = re.sub(r'\[\d+\]|\[note\s*\d+\]|\[citation needed\]', '', text, flags=re.IGNORECASE)

        # Split into sentences using punctuation boundaries
        raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'])', cleaned_text)
        sentences = [' '.join(s.split()) for s in raw_sentences if len(s.strip()) > 15]

        target_lower = target_title.lower()

        # 1. Look for full exact title match in sentence
        for s in sentences:
            if target_lower in s.lower():
                return s[:350].strip()

        # 2. Look for significant distinct words (e.g. surname for people or core noun)
        words = [w for w in re.split(r'\W+', target_title) if len(w) > 3 and w.lower() not in {"from", "with", "that", "this", "they", "their", "into"}]
        if words:
            key_word = words[-1].lower()
            for s in sentences:
                if re.search(r'\b' + re.escape(key_word) + r'\b', s, re.IGNORECASE):
                    return s[:350].strip()

        return f"Referenced in Wikipedia article on '{page.title}'."
    except Exception:
        return f"Referenced in Wikipedia article on '{page.title}'."

def fetch_wikipedia_data(title: str, db: Session, limit: int = 100):
    """
    Fetches a page from Wikipedia, creates a Node for it,
    and creates nodes/edges for linked pages with full details.
    Yields progress updates and finally the result.
    """
    try:
        yield json.dumps({"status": "progress", "message": f"Fetching page '{title}'..."}) + "\n"
        
        page = wiki.page(title)
        
        if not page.exists():
            yield json.dumps({"status": "error", "message": "Page not found"}) + "\n"
            return

        yield json.dumps({"status": "progress", "message": f"Creating main node for '{title}'..."}) + "\n"
        main_node = get_or_create_node_from_page(page, db)
        
        # 1. Global Connectivity Check
        yield json.dumps({"status": "progress", "message": "Checking global connectivity..."}) + "\n"
        all_links = set(page.links.keys())
        existing_nodes = db.query(Node).filter(Node.label.in_(all_links)).all()
        
        for target_node in existing_nodes:
            if target_node.id == main_node.id:
                continue
                
            edge_exists = db.query(Edge).filter(
                Edge.source_id == main_node.id,
                Edge.target_id == target_node.id
            ).first()
            
            if not edge_exists:
                explanation = extract_relationship_explanation(page, target_node.label)
                new_edge = Edge(
                    source_id=main_node.id,
                    target_id=target_node.id,
                    relation="links_to",
                    properties={"explanation": explanation}
                )
                db.add(new_edge)
        
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            # Non-critical, continue

        # 2. Expand Graph (Discovery)
        yield json.dumps({"status": "progress", "message": f"Analyzing top {limit} connections..."}) + "\n"
        
        # Get candidate links
        candidate_links = list(page.links.keys())
        
        # Filter links: Keep only if mentioned in Summary or Main Text (first 10k chars)
        # This helps avoid footer/sidebar links
        main_text_lower = (page.summary + " " + page.text[:10000]).lower()
        
        filtered_links = []
        for link in candidate_links:
            # Simple check: is the link title in the text?
            # We use the regex helper or simple string check. 
            # Simple string check is faster and usually sufficient for this purpose.
            if link.lower() in main_text_lower:
                filtered_links.append(link)
        
        # If we filtered too aggressively and have few links, maybe fallback to original list?
        # But User wants relevance, so let's stick to filtered.
        # However, if filtered is empty, we might want to return *something*.
        if len(filtered_links) < 5:
             # Fallback: take first few raw links just in case
             filtered_links = candidate_links[:5]
        
        links = filtered_links[:limit]
        
        for i, link_title in enumerate(links):
            yield json.dumps({"status": "progress", "message": f"Processing link {i+1}/{len(links)}: {link_title}"}) + "\n"
            
            # Check if node exists first to avoid fetching page if we already have it
            link_node = db.query(Node).filter(Node.label == link_title).first()
            
            if not link_node:
                # Fetch the actual page object to get summary and infer type
                link_page = wiki.page(link_title)
                if link_page.exists():
                    link_node = get_or_create_node_from_page(link_page, db)
                else:
                    continue
            
            # Create Edge
            if link_node:
                edge_exists = db.query(Edge).filter(
                    Edge.source_id == main_node.id,
                    Edge.target_id == link_node.id
                ).first()
                
                if not edge_exists:
                    explanation = extract_relationship_explanation(page, link_node.label)
                    edge = Edge(
                        source_id=main_node.id,
                        target_id=link_node.id,
                        relation="links_to",
                        properties={"explanation": explanation}
                    )
                    db.add(edge)
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()
                
        yield json.dumps({"status": "complete", "node_id": main_node.id, "label": main_node.label}) + "\n"

    except Exception as e:
        yield json.dumps({"status": "error", "message": f"Server Error: {str(e)}"}) + "\n"



