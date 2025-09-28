# mapapp/urls.py
from django.urls import path
from .views import PropertySearch, PlacePhoto, PropertyDetail, NearbyAround
from .agent_bridge import AgentCommandView

app_name = "mapapp"

urlpatterns = [
    path("properties/search/", PropertySearch.as_view(), name="properties-search"),
    path("properties/<str:place_id>/", PropertyDetail.as_view(), name="detail"),
    path("places/photo/", PlacePhoto.as_view(), name="places-photo"),
    path("places/nearby/", NearbyAround.as_view(), name="nearby"),
    # Agent → UI mailbox
    path("agent/command/", AgentCommandView.as_view(), name="agent-command"),
]
