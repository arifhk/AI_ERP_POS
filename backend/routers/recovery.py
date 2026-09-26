"""Forgot-password and reset-password for every account role."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import hash_password
from database import get_session
from models import PasswordResetToken, User

router = APIRouter()

RESET_MINUTES = 30


class ForgotPasswordBody(SQLModel):
    email: str


class ResetPasswordBody(SQLModel):
    token: str
    password: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    email = payload.email.strip().lower()
    message = "If that email is registered, a reset link is ready."
    if not email or "@" not in email:
        return {"message": message}

    user = (await session.exec(select(User).where(func.lower(User.email) == email))).first()
    if user is None or user.id is None:
        return {"message": message}

    now = datetime.now(timezone.utc)
    existing = (await session.exec(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))).all()
    for row in existing:
        if row.used_at is None:
            await session.delete(row)

    raw_token = secrets.token_urlsafe(32)
    session.add(
        PasswordResetToken(
            token=_hash_token(raw_token),
            user_id=user.id,
            expires_at=now + timedelta(minutes=RESET_MINUTES),
        )
    )
    await session.commit()
    return {
        "message": message,
        "reset_token": raw_token,
        "expires_in_minutes": str(RESET_MINUTES),
    }


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    password = payload.password.strip()
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters.")
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired.")

    row = (await session.exec(select(PasswordResetToken).where(PasswordResetToken.token == _hash_token(token)))).first()
    now = datetime.now(timezone.utc)
    if row is None or row.used_at is not None or _as_utc(row.expires_at) < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired.")

    user = await session.get(User, row.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired.")

    user.hashed_password = hash_password(password)
    row.used_at = now
    session.add(user)
    session.add(row)
    await session.commit()
    return {"message": "Password updated. You can sign in."}
