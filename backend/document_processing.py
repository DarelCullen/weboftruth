from pypdf import PdfReader
from docx import Document
import io
from models import Node, Edge
from database import SessionLocal


from sqlalchemy.orm import Session

def process_document(filename: str, file_content: bytes, db: Session):
    text = ""
    if filename.endswith(".pdf"):

        reader = PdfReader(io.BytesIO(file_content))
        for page in reader.pages:
            text += page.extract_text() + "\n"
    elif filename.endswith(".docx"):
        doc = Document(io.BytesIO(file_content))
        for para in doc.paragraphs:
            text += para.text + "\n"
    else:
        # Assume text
        text = file_content.decode("utf-8")
    
    # Create a node for the document
    # Create a node for the document
    # db passed as arg
    
    doc_node = Node(
        label=filename,
        type="Document",
        properties={"content_snippet": text[:500], "full_text_length": len(text)}
    )

    db.add(doc_node)
    db.commit()
    db.refresh(doc_node)
    
    # Simple entity extraction (Placeholder for more complex logic)
    # For now, let's just look for capitalized words that might be entities
    # or just leave it as a single node.
    # Ideally, we would use spacy or similar here.
    
    return doc_node


