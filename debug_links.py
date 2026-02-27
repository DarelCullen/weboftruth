import wikipediaapi

wiki = wikipediaapi.Wikipedia(
    user_agent='WebOfTruth/1.0 (http://example.com/contact)',
    language='en'
)

def check_link(source_title, target_title):
    print(f"Checking if '{source_title}' links to '{target_title}'...")
    page = wiki.page(source_title)
    
    if not page.exists():
        print(f"Page '{source_title}' does not exist.")
        return

    links = page.links
    # Case insensitive check
    target_lower = target_title.lower()
    found = False
    for title in links.keys():
        if title.lower() == target_lower:
            print(f"✅ FOUND: '{source_title}' -> '{title}'")
            found = True
            break
            
    if not found:
        print(f"❌ NOT FOUND: '{source_title}' does NOT link to '{target_title}'")

    # Reverse check
    print(f"Checking reverse: if '{target_title}' links to '{source_title}'...")
    page_target = wiki.page(target_title)
    if page_target.exists():
        links_target = page_target.links
        source_lower = source_title.lower()
        found_rev = False
        for title in links_target.keys():
            if title.lower() == source_lower:
                print(f"✅ FOUND: '{target_title}' -> '{title}'")
                found_rev = True
                break
        if not found_rev:
             print(f"❌ NOT FOUND: '{target_title}' does NOT link to '{source_title}'")

check_link("Bilderberg meeting", "BBC")
check_link("Bilderberg meeting", "Elon Musk")
