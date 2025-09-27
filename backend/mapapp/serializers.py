# mapapp/serializers.py
from rest_framework import serializers


class SearchQuerySerializer(serializers.Serializer):
    """
    Validates query params for /api/properties/search/.
    mode:
      - "text": requires q
      - "nearby": requires sw & ne
      - None/empty: legacy fallback allowed (we won't force strictness)
    """
    mode = serializers.ChoiceField(choices=["text", "nearby"], required=False, allow_blank=True)
    q = serializers.CharField(required=False, allow_blank=True)
    sw = serializers.CharField(required=False)  # "lat,lng"
    ne = serializers.CharField(required=False)  # "lat,lng"

    def validate(self, attrs):
        mode = (attrs.get("mode") or "").strip().lower()
        q = (attrs.get("q") or "").strip()
        sw = attrs.get("sw")
        ne = attrs.get("ne")

        if mode == "text":
            if not q:
                raise serializers.ValidationError({"q": "Query (q) is required when mode=text."})
        elif mode == "nearby":
            if not (sw and ne):
                raise serializers.ValidationError({"bounds": "sw and ne are required when mode=nearby."})
            # Optional: validate "lat,lng" format lightly
            for label, v in (("sw", sw), ("ne", ne)):
                try:
                    lat_str, lng_str = v.split(",", 1)
                    float(lat_str); float(lng_str)
                except Exception:
                    raise serializers.ValidationError({label: "Expected 'lat,lng'."})
        # else: legacy path, allow both q-only or bounds-only

        return attrs


class PlaceSerializer(serializers.Serializer):
    """
    Output serializer for a normalized place (apartment complex).
    Matches the shape your React app expects.
    """
    id = serializers.CharField()
    name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    address = serializers.CharField(allow_blank=True, allow_null=True, required=False)

    lat = serializers.FloatField(allow_null=True, required=False)
    lng = serializers.FloatField(allow_null=True, required=False)

    primaryType = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    types = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )

    rating = serializers.FloatField(allow_null=True, required=False)
    user_ratings_total = serializers.IntegerField(allow_null=True, required=False)

    url = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    image_url = serializers.CharField(allow_blank=True, allow_null=True, required=False)
