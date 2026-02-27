import wikipediaapi

wiki = wikipediaapi.Wikipedia(
    user_agent='WebOfTruth/1.0 (http://example.com/contact)',
    language='en'
)

def inspect(title):
    page = wiki.page(title)
    print(f"--- {title} ---")
    if not page.exists():
        print("Page does not exist.")
        return
    
    print(f"Summary (first 200): {page.summary[:200]}")
    
    # Check for keywords (current logic)
    summary_lower = page.summary[:200].lower()
    if "person" in summary_lower:
        print("MATCHED 'person' in summary")
    
    print("Categories:")
    for cat in list(page.categories.keys())[:10]: # Print first 10
        print(f"  - {cat}")

inspect("Macintosh")
inspect("Barack Obama")
inspect("Apple Inc.")
