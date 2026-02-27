from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, index=True)
    type = Column(String, index=True)
    properties = Column(JSON, default={})

    # Relationships can be complex in a graph DB context efficiently modeled in SQL
    # We will query edges manually or setup specific relationships if needed.

class Edge(Base):
    __tablename__ = "edges"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("nodes.id"))
    target_id = Column(Integer, ForeignKey("nodes.id"))
    relation = Column(String, index=True)
    properties = Column(JSON, default={})

    source = relationship("Node", foreign_keys=[source_id])
    target = relationship("Node", foreign_keys=[target_id])
