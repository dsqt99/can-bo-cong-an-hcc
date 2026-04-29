import os
import asyncpg
import logging
import json
import asyncio

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.pool_loop = None
        self.db_url = os.getenv("DATABASE_URL", "postgresql://openwebui:openwebui@openwebui-db:5432/openwebui")

    async def _ensure_pool(self):
        current_loop = asyncio.get_running_loop()
        if self.pool and self.pool_loop is current_loop:
            return

        if self.pool:
            try:
                await self.pool.close()
            except Exception:
                pass

        self.pool = await asyncpg.create_pool(dsn=self.db_url, min_size=1, max_size=10)
        self.pool_loop = current_loop

        async with self.pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS cahy_chat_sessions (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_cahy_session_id ON cahy_chat_sessions(session_id);
            ''')

    async def init_db(self):
        try:
            await self._ensure_pool()
            logger.info("✅ Database initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize database: {e}")
            self.pool = None
            self.pool_loop = None
            raise

    async def save_message(self, session_id: str, role: str, content: str):
        try:
            await self._ensure_pool()
            async with self.pool.acquire() as conn:
                await conn.execute(
                    '''INSERT INTO cahy_chat_sessions (session_id, role, content) VALUES ($1, $2, $3)''',
                    session_id, role, content
                )
        except Exception as e:
            logger.error(f"❌ Failed to save message to DB: {e}")

    async def load_session(self, session_id: str):
        try:
            await self._ensure_pool()
            async with self.pool.acquire() as conn:
                records = await conn.fetch(
                    '''SELECT role, content FROM cahy_chat_sessions WHERE session_id = $1 ORDER BY timestamp ASC''',
                    session_id
                )
                return [{"role": r["role"], "content": r["content"]} for r in records]
        except Exception as e:
            logger.error(f"❌ Failed to load session from DB: {e}")
            return []

    async def clear_session(self, session_id: str):
        try:
            await self._ensure_pool()
            async with self.pool.acquire() as conn:
                await conn.execute(
                    '''DELETE FROM cahy_chat_sessions WHERE session_id = $1''',
                    session_id
                )
        except Exception as e:
            logger.error(f"❌ Failed to clear session from DB: {e}")

db_manager = DatabaseManager()
