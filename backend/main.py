from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from models import Base, Node, Edge
from database import SessionLocal, engine
from pydantic import BaseModel

from typing import List, Optional, Dict, Any
from sourcing import fetch_wikipedia_data
from document_processing import process_document




# Database Setup
# Database Setup
Base.metadata.create_all(bind=engine)


# App Setup
app = FastAPI(title="Web of Truth API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Models
class NodeCreate(BaseModel):
    label: str
    type: str
    properties: Dict[str, Any] = {}

class NodeResponse(NodeCreate):
    id: int

    class Config:
        from_attributes = True

class EdgeCreate(BaseModel):
    source_id: int
    target_id: int
    relation: str
    properties: Dict[str, Any] = {}
    explanation: Optional[str] = None

class EdgeResponse(BaseModel):
    id: int
    source_id: int
    target_id: int
    relation: str
    properties: Dict[str, Any] = {}

    class Config:
        from_attributes = True

class GraphResponse(BaseModel):
    nodes: List[NodeResponse]
    links: List[EdgeResponse]

class WikiImportRequest(BaseModel):
    title: str
    limit: Optional[int] = 100

from fastapi.responses import StreamingResponse

# Endpoints
@app.post("/import/wikipedia")
def import_wikipedia(request: WikiImportRequest, db: Session = Depends(get_db)):
    return StreamingResponse(fetch_wikipedia_data(request.title, db, request.limit), media_type="application/x-ndjson")

@app.post("/import/upload", response_model=NodeResponse)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    node = process_document(file.filename, content, db)
    return node


@app.post("/nodes/", response_model=NodeResponse)


def create_node(node: NodeCreate, db: Session = Depends(get_db)):
    db_node = Node(**node.dict())
    db.add(db_node)
    db.commit()
    db.refresh(db_node)
    return db_node

@app.get("/nodes/", response_model=List[NodeResponse])
def read_nodes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    nodes = db.query(Node).offset(skip).limit(limit).all()
    return nodes

@app.delete("/nodes/{node_id}", status_code=204)
def delete_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Delete associated edges
    db.query(Edge).filter((Edge.source_id == node_id) | (Edge.target_id == node_id)).delete()
    
    db.delete(node)
    db.commit()
    return


@app.post("/edges/", response_model=EdgeResponse)
def create_edge(edge: EdgeCreate, db: Session = Depends(get_db)):
    # Verify nodes exist
    source = db.query(Node).filter(Node.id == edge.source_id).first()
    target = db.query(Node).filter(Node.id == edge.target_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or Target node not found")
    
    edge_data = edge.dict()
    explanation = edge_data.pop("explanation", None)
    if explanation and "explanation" not in edge_data.get("properties", {}):
        edge_data.setdefault("properties", {})["explanation"] = explanation

    db_edge = Edge(**edge_data)
    db.add(db_edge)
    db.commit()
    db.refresh(db_edge)
    return db_edge

@app.get("/edges/", response_model=List[EdgeResponse])
def read_edges(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    edges = db.query(Edge).offset(skip).limit(limit).all()
    return edges

@app.get("/graph/", response_model=GraphResponse)
def get_entire_graph(db: Session = Depends(get_db)):
    nodes = db.query(Node).all()
    edges = db.query(Edge).all()
    return {"nodes": nodes, "links": edges}

@app.delete("/graph", status_code=204)
def clear_graph(db: Session = Depends(get_db)):
    db.query(Edge).delete()
    db.query(Node).delete()
    db.commit()
    return

@app.get("/")

def read_root():
    return {"message": "Web of Truth API is running"}
