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
    birthdate = serializers.DateField(
        required=True,
        help_text="Data de nascimento (YYYY-MM-DD). Imutável após cadastro.",
    )

    class Meta:
        model = User
        fields = ["username", "email", "password", "birthdate"]
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

    def validate_birthdate(self, value):
        from datetime import date

        today = date.today()
        if value > today:
            raise serializers.ValidationError("Data de nascimento inválida.")
        # 13 anos é o piso legal para qualquer cadastro online no Brasil (ECA).
        age = (
            today.year
            - value.year
            - ((today.month, today.day) < (value.month, value.day))
        )
        if age < 13:
            raise serializers.ValidationError(
                "Idade mínima para cadastro é 13 anos."
            )
        return value

    def create(self, validated_data: dict) -> "User":
        from django.utils import timezone

        birthdate = validated_data.pop("birthdate")
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        # Profile is auto-created via signal; fill the birthdate now and lock.
        if hasattr(user, "profile"):
            user.profile.birthdate = birthdate
            user.profile.birthdate_set_at = timezone.now()
            user.profile.save(update_fields=["birthdate", "birthdate_set_at"])
        return user


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def register(request):
    from accounts.auth_jwt import apply_login_cookies
    from accounts.turnstile import verify as verify_turnstile

    # Bot challenge antes de qualquer trabalho — corta account-farming
    # automatizado bem antes do banco. Em dev (sem TURNSTILE_SECRET_KEY)
    # passa direto.
    token = (request.data or {}).get("turnstile_token") or ""
    if not verify_turnstile(token, request=request):
        return Response(
            {"detail": "Falha na verificacao de bot. Recarregue a pagina e tente de novo."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)
    response = Response(
        {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
            },
            # Tokens nao saem mais no body — viajam em HttpOnly cookies.
            "detail": "registered",
        },
        status=status.HTTP_201_CREATED,
    )
    return apply_login_cookies(response, access=str(refresh.access_token), refresh=str(refresh))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    """Blacklist o refresh token (cookie OU body) e limpa os cookies."""
    from accounts.auth_jwt import REFRESH_COOKIE, clear_login_cookies

    token_str = (request.data or {}).get("refresh") or request.COOKIES.get(REFRESH_COOKIE)
    if token_str:
        try:
            RefreshToken(token_str).blacklist()
        except TokenError:
            # Token ja expirado/blacklisted — segue limpando cookies igual.
            pass

    response = Response(status=status.HTTP_205_RESET_CONTENT)
    return clear_login_cookies(response)


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
