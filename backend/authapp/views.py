# authapp/views.py
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import RegisterSerializer, UserSerializer
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.http import JsonResponse
import traceback
from rest_framework_simplejwt.views import TokenObtainPairView

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


# Debug wrapper for TokenObtainPairView
@csrf_exempt
def login_debug(request):
    """
    POST /api/auth/login-debug/

    Only enabled when DEBUG is True. Proxies the normal login view and
    returns exception traceback in the JSON body to help diagnose server 500s.
    Do NOT enable in production.
    """
    if not settings.DEBUG:
        return JsonResponse({"detail": "Not allowed."}, status=403)

    try:
        # Delegate to the existing simplejwt view
        return TokenObtainPairView.as_view()(request)
    except Exception as e:
        tb = traceback.format_exc()
        return JsonResponse({"error": str(e), "traceback": tb}, status=500)
