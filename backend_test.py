import requests
import json

url = "http://localhost:8000/import/wikipedia"
payload = {"title": "Physics", "limit": 123} # Use a unique number

print(f"Testing with limit: {payload['limit']}")

with requests.post(url, json=payload, stream=True) as r:
    for line in r.iter_lines():
        if line:
            data = json.loads(line)
            if "Analyzing top" in data.get("message", ""):
                print(f"Backend log: {data['message']}")
                break
