# backend/voiceagent/tools.py
import requests

def property_search_tool(query: str):
    """
    Calls the PropertySearch API in text mode.
    Example: query="Norfolk,VA" or query="24060"
    """
    resp = requests.get(
        "http://127.0.0.1:8000/api/properties/search/",
        params={"mode": "text", "q": query},
        timeout=10,
    )
    return resp.json()
