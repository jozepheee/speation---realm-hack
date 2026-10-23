"""Keep provider connections warm during the API lifespan; tests/jobs stay isolated."""
from contextlib import asynccontextmanager
import httpx

_clients=None


def start():
    global _clients
    _clients={}


async def close():
    global _clients
    clients=_clients;_clients=None
    for client in (clients or {}).values():await client.aclose()


@asynccontextmanager
async def client(timeout):
    if _clients is None:
        async with httpx.AsyncClient(timeout=timeout) as temporary:yield temporary
    else:
        if timeout not in _clients:_clients[timeout]=httpx.AsyncClient(timeout=timeout,limits=httpx.Limits(max_connections=20,max_keepalive_connections=10,keepalive_expiry=120))
        yield _clients[timeout]
