import unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, Base, engine
from models import Node, Edge
from sourcing import extract_relationship_explanation

class TestRelationshipExplanation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.db.query(Edge).delete()
        self.db.query(Node).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_extract_relationship_explanation_exact_match(self):
        mock_page = SimpleNamespace(
            title="Artificial Intelligence",
            summary="Artificial intelligence (AI) is intelligence demonstrated by machines. Alan Turing proposed tests for machine thinking.",
            text="AI was founded at a workshop at Dartmouth College in 1956. Machine learning is a subfield of artificial intelligence."
        )
        explanation = extract_relationship_explanation(mock_page, "Dartmouth College")
        self.assertIn("Dartmouth College", explanation)
        self.assertIn("1956", explanation)

    def test_extract_relationship_explanation_partial_match(self):
        mock_page = SimpleNamespace(
            title="Artificial Intelligence",
            summary="Alan Turing is widely considered to be the father of theoretical computer science.",
            text="Deep learning techniques have accelerated AI capabilities."
        )
        explanation = extract_relationship_explanation(mock_page, "Alan Mathison Turing")
        self.assertIn("Turing", explanation)

    def test_edge_creation_and_api_response(self):
        # 1. Create two nodes
        n1 = Node(label="Entity A", type="Person", properties={})
        n2 = Node(label="Entity B", type="Organization", properties={})
        self.db.add_all([n1, n2])
        self.db.commit()
        self.db.refresh(n1)
        self.db.refresh(n2)

        # 2. Create edge via API with explanation
        resp = self.client.post("/edges/", json={
            "source_id": n1.id,
            "target_id": n2.id,
            "relation": "links_to",
            "properties": {},
            "explanation": "Entity A was the chief executive of Entity B from 2010 to 2020."
        })
        self.assertEqual(resp.status_code, 200)
        edge_data = resp.json()
        self.assertEqual(edge_data["relation"], "links_to")
        self.assertIn("explanation", edge_data["properties"])
        self.assertEqual(edge_data["properties"]["explanation"], "Entity A was the chief executive of Entity B from 2010 to 2020.")

        # 3. Verify /graph/ endpoint returns the explanation
        graph_resp = self.client.get("/graph/")
        self.assertEqual(graph_resp.status_code, 200)
        graph_data = graph_resp.json()
        self.assertEqual(len(graph_data["links"]), 1)
        link = graph_data["links"][0]
        self.assertEqual(link["relation"], "links_to")
        self.assertEqual(link["properties"]["explanation"], "Entity A was the chief executive of Entity B from 2010 to 2020.")

if __name__ == "__main__":
    unittest.main()
