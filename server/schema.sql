CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','professional','reader')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,email TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','professional','reader')),kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),expires_at INTEGER NOT NULL,used_at INTEGER,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,kind TEXT NOT NULL,summary TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',file_key TEXT,file_name TEXT,status TEXT NOT NULL CHECK(status IN ('published','pending','rejected','archived')),author_id TEXT NOT NULL REFERENCES users(id),author_name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,review_note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_materials_status_created ON materials(status,created_at);
CREATE INDEX IF NOT EXISTS idx_materials_author ON materials(author_id);
CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,subject_id TEXT NOT NULL,created_at TEXT NOT NULL);
