"""Run once per Memgraph deployment; contains no patient data or seeded results."""
import asyncio
from knowledge_graph.service import get_graph


async def main():
    graph = get_graph()
    try:
        await graph.initialize()
        assert await graph.ready()
        print("Memgraph indexes, unique constraints and connectivity verified.")
    finally:
        await graph.close()


if __name__ == "__main__":
    asyncio.run(main())
