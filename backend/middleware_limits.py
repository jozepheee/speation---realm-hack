"""Shared Redis limits in production; bounded local limits during development."""
import hashlib
import time
from collections import OrderedDict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from redis.asyncio import Redis
from config import settings


class RequestLimits(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.redis = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
        self.local = OrderedDict()

    async def dispatch(self, request, call_next):
        length = request.headers.get("content-length")
        if length and (not length.isdigit() or int(length) > 21 * 1024 * 1024):
            return JSONResponse({"detail": "Request exceeds the upload limit"}, status_code=413)
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            return response
        if request.url.path == "/auth/login":
            limit, window = 10, 60
        elif request.url.path == "/auth/register":
            limit, window = 10, 3600
        else:
            limit, window = 60, 60
        # No trusted X-Forwarded-For shortcut: only a configured proxy should rewrite client IPs.
        identity = request.client.host if request.client else "unknown"
        digest = hashlib.sha256(f"{identity}:{request.url.path}:{int(time.time()) // window}".encode()).hexdigest()
        if settings.APP_ENV == "production":
            try:
                count = await self.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n", 1, f"nn:limit:{digest}", window)
            except Exception:
                return JSONResponse({"detail": "Request protection is unavailable"}, status_code=503)
        else:
            # ponytail: per-process development limit; production always uses shared Redis.
            self.local[digest] = self.local.get(digest, 0) + 1
            count = self.local[digest]
            if len(self.local) > 10000:
                self.local.popitem(last=False)
        if count > limit:
            return JSONResponse({"detail": "Too many requests. Please wait and try again."}, status_code=429, headers={"Retry-After": str(window)})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
