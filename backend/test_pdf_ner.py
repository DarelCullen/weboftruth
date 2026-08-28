import io
import unittest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, Base, engine
from models import Node, Edge

class TestPDFEntityExtraction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        # Clean graph for isolated test
        self.db.query(Edge).delete()
        self.db.query(Node).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_pdf_upload_and_ner_mapping(self):
        # 1. Create a PDF in-memory with known entities and relationships
        pdf_buffer = io.BytesIO()
        can = canvas.Canvas(pdf_buffer, pagesize=letter)
        can.drawString(50, 750, "Computer Science History and Research Centers")
        can.drawString(50, 720, "Alan Turing worked with codebreakers in Bletchley Park near London.")
        can.drawString(50, 690, "Ada Lovelace collaborated with Charles Babbage in London.")
        can.drawString(50, 660, "Geoffrey Hinton and Yoshua Bengio advanced deep learning research.")
        can.drawString(50, 630, "Google DeepMind was established in London and Cambridge by Demis Hassabis.")
        can.showPage()
        
        # Page 2
        can.drawString(50, 750, "Silicon Valley & Modern Labs")
        can.drawString(50, 720, "OpenAI and Anthropic operate out of San Francisco, California.")
        can.drawString(50, 690, "Microsoft invested heavily in OpenAI in Redmond, Washington.")
        can.save()
        
        pdf_buffer.seek(0)
        
        # 2. Upload via API endpoint
        response = self.client.post(
            "/import/upload",
            files={"file": ("cs_pioneers.pdf", pdf_buffer.getvalue(), "application/pdf")}
        )
        self.assertEqual(response.status_code, 200, f"Upload failed: {response.text}")
        doc_data = response.json()
        
        self.assertEqual(doc_data["label"], "cs_pioneers.pdf")
        self.assertEqual(doc_data["type"], "Document")
        self.assertGreater(doc_data["properties"]["entities_found"], 5)
        
        # 3. Query the entire graph
        graph_resp = self.client.get("/graph/")
        self.assertEqual(graph_resp.status_code, 200)
        graph = graph_resp.json()
        
        nodes = graph["nodes"]
        links = graph["links"]
        
        node_labels = {n["label"]: n for n in nodes}
        print("\nExtracted Graph Nodes:")
        for n in nodes:
            print(f" - [{n['type']}] {n['label']}")
            
        print("\nExtracted Graph Links:")
        for l in links:
            s_label = next((n['label'] for n in nodes if n['id'] == l['source_id']), l['source_id'])
            t_label = next((n['label'] for n in nodes if n['id'] == l['target_id']), l['target_id'])
            print(f" - {s_label} --({l['relation']})--> {t_label}")
            
        # Assert key entities were identified
        self.assertIn("cs_pioneers.pdf", node_labels)
        
        # Check that people are categorized
        person_nodes = [n for n in nodes if n["type"] == "Person"]
        self.assertGreater(len(person_nodes), 0, "Should extract Person entities")
        
        # Check that locations are categorized
        location_nodes = [n for n in nodes if n["type"] == "Location"]
        self.assertGreater(len(location_nodes), 0, "Should extract Location entities")
        
        # Check that organizations are categorized
        org_nodes = [n for n in nodes if n["type"] == "Organization"]
        self.assertGreater(len(org_nodes), 0, "Should extract Organization entities")
        
        # Check edges
        mention_links = [l for l in links if l["relation"] == "mentions"]
        self.assertGreater(len(mention_links), 5, "Document should have mention links to entities")
        
        co_occur_links = [l for l in links if l["relation"] == "co_occurs_with"]
        self.assertGreater(len(co_occur_links), 0, "Should have co-occurrence links between entities")

if __name__ == "__main__":
    unittest.main()
