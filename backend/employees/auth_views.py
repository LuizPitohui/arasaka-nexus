"""Authentication endpoints: register, logout, current user.

Uses Django's built-in User model plus simplejwt's token blacklist for proper
server-side logout. A dedicated ``accounts`` app will be introduced when we
add the Profile model in Phase 3 (user library).
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class RegisterThrottle(AnonRateThrottle):
    scope = "register"
    rate = "20/hour"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password"]
        extra_kwargs = {
            "username": {"required": True},
            "email": {"required": True},
        }

    def validate_username(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Username precisa ter ao menos 3 caracteres.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username já cadastrado.")
        return value

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("Email é obrigatório.")
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email já cadastrado.")
        return value

    def validate_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data: dict) -> "User":
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
            },
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    """Blacklist the supplied refresh token so it can no longer mint accesses."""
    token_str = (request.data or {}).get("refresh")
    if not token_str:
        return Response(
            {"error": "refresh token é obrigatório"}, status=status.HTTP_400_BAD_REQUEST
        )
    try:
        token = RefreshToken(token_str)
        token.blacklist()
    except TokenError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(status=status.HTTP_205_RESET_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return Response(
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_staff": user.is_staff,
            "date_joined": user.date_joined,
        }
    )
