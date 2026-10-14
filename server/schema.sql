CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','professional','reader')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,email TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','professional','reader')),kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),expires_at INTEGER NOT NULL,used_at INTEGER,created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,kind TEXT NOT NULL,summary TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',file_key TEXT,file_name TEXT,status TEXT NOT NULL CHECK(status IN ('published','pending','rejected','archived')),author_id TEXT NOT NULL REFERENCES users(id),author_name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,review_note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_materials_status_created ON materials(status,created_at);
CREATE INDEX IF NOT EXISTS idx_materials_author ON materials(author_id);
CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,subject_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,visibility TEXT NOT NULL CHECK(visibility IN ('team','restricted')),status TEXT NOT NULL CHECK(status IN ('published','pending','rejected','archived')),file_key TEXT NOT NULL,file_name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),author_name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,review_note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status,created_at);
CREATE INDEX IF NOT EXISTS idx_images_author ON images(author_id);

CREATE TABLE IF NOT EXISTS material_versions(id INTEGER PRIMARY KEY AUTOINCREMENT,material_id TEXT NOT NULL REFERENCES materials(id),snapshot TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_versions_material ON material_versions(material_id,id);
CREATE TABLE IF NOT EXISTS material_activity(user_id TEXT NOT NULL REFERENCES users(id),material_id TEXT NOT NULL REFERENCES materials(id),favorite INTEGER NOT NULL DEFAULT 0,last_opened TEXT,PRIMARY KEY(user_id,material_id));

CREATE TABLE IF NOT EXISTS protocol_exercises(
 id TEXT PRIMARY KEY,target_kind TEXT NOT NULL CHECK(target_kind IN ('guide','material')),target_id TEXT NOT NULL,
 title TEXT NOT NULL,steps TEXT NOT NULL,dose TEXT NOT NULL,phase TEXT NOT NULL DEFAULT '',equipment TEXT NOT NULL DEFAULT '',chain TEXT NOT NULL DEFAULT '',
 restriction TEXT NOT NULL DEFAULT '',progress TEXT NOT NULL DEFAULT '',reference TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('published','pending','archived')),author_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_protocol_exercises_target ON protocol_exercises(target_kind,target_id,status);

CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',owner_id TEXT NOT NULL REFERENCES users(id),password_hash TEXT,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_patients_owner ON patients(owner_id,active);
CREATE TABLE IF NOT EXISTS patient_sessions(token_hash TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_patient_sessions_patient ON patient_sessions(patient_id);
CREATE TABLE IF NOT EXISTS patient_invites(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,patient_id TEXT NOT NULL REFERENCES patients(id),kind TEXT NOT NULL CHECK(kind IN ('activate','reset')),expires_at INTEGER NOT NULL,used_at INTEGER,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_plans(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),author_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,goal TEXT NOT NULL DEFAULT '',instructions TEXT NOT NULL DEFAULT '',start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','active','completed','archived')),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT);
CREATE INDEX IF NOT EXISTS idx_care_plans_patient ON care_plans(patient_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_care_one_active ON care_plans(patient_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS care_tasks(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('exercise','conduct')),title TEXT NOT NULL,steps TEXT NOT NULL,dose TEXT NOT NULL,days TEXT NOT NULL,equipment TEXT NOT NULL DEFAULT '',restriction TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL,coach_config TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_care_tasks_plan ON care_tasks(plan_id,position);
CREATE TABLE IF NOT EXISTS care_logs(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),task_id TEXT NOT NULL REFERENCES care_tasks(id),performed_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('done','partial','skipped')),pain INTEGER CHECK(pain BETWEEN 0 AND 10),difficulty INTEGER CHECK(difficulty BETWEEN 0 AND 10),comment TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(patient_id,task_id,performed_date));
CREATE INDEX IF NOT EXISTS idx_care_logs_patient_date ON care_logs(patient_id,performed_date);
CREATE TABLE IF NOT EXISTS care_feedback(id TEXT PRIMARY KEY,log_id TEXT NOT NULL REFERENCES care_logs(id),author_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS care_measurements(
 id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),plan_id TEXT NOT NULL REFERENCES care_plans(id),performed_date TEXT NOT NULL,
 eva_before INTEGER NOT NULL CHECK(eva_before BETWEEN 0 AND 100),borg_before REAL NOT NULL,before_at TEXT NOT NULL,
 eva_after INTEGER CHECK(eva_after BETWEEN 0 AND 100),borg_after REAL,after_at TEXT,
 borg_scale TEXT NOT NULL DEFAULT 'rpe6_20' CHECK(borg_scale IN ('rpe6_20','modified0_10')),
 revision INTEGER NOT NULL DEFAULT 1,UNIQUE(patient_id,plan_id,performed_date),
 CHECK((borg_scale='rpe6_20' AND borg_before BETWEEN 6 AND 20 AND borg_before=CAST(borg_before AS INTEGER) AND (borg_after IS NULL OR (borg_after BETWEEN 6 AND 20 AND borg_after=CAST(borg_after AS INTEGER)))) OR (borg_scale='modified0_10' AND borg_before IN (0,0.5,1,2,3,4,5,6,7,8,9,10) AND (borg_after IS NULL OR borg_after IN (0,0.5,1,2,3,4,5,6,7,8,9,10)))),
 CHECK((eva_after IS NULL AND borg_after IS NULL AND after_at IS NULL) OR (eva_after IS NOT NULL AND borg_after IS NOT NULL AND after_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_care_measurements_patient ON care_measurements(patient_id,performed_date);

CREATE TABLE IF NOT EXISTS care_function_goals(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),author_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_function_goals_patient ON care_function_goals(patient_id,active);
CREATE TABLE IF NOT EXISTS care_function_logs(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),goal_id TEXT NOT NULL REFERENCES care_function_goals(id),performed_date TEXT NOT NULL,score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),comment TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(patient_id,goal_id,performed_date));
CREATE INDEX IF NOT EXISTS idx_function_logs_patient ON care_function_logs(patient_id,performed_date);
CREATE TABLE IF NOT EXISTS care_progress_notes(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),author_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_progress_notes_patient ON care_progress_notes(patient_id,created_at);

CREATE TABLE IF NOT EXISTS care_patient_diary(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),performed_date TEXT NOT NULL,perception TEXT NOT NULL DEFAULT '',complaints TEXT NOT NULL DEFAULT '',feedback TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(patient_id,performed_date));
CREATE INDEX IF NOT EXISTS idx_patient_diary_date ON care_patient_diary(patient_id,performed_date);
CREATE TABLE IF NOT EXISTS care_patient_diary_history(id INTEGER PRIMARY KEY AUTOINCREMENT,entry_id TEXT NOT NULL REFERENCES care_patient_diary(id),perception TEXT NOT NULL,complaints TEXT NOT NULL,feedback TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS care_measurement_corrections(id TEXT PRIMARY KEY,measurement_id TEXT NOT NULL REFERENCES care_measurements(id),patient_id TEXT NOT NULL REFERENCES patients(id),phase TEXT NOT NULL CHECK(phase IN ('before','after')),previous_eva INTEGER NOT NULL,previous_borg REAL NOT NULL,new_eva INTEGER NOT NULL,new_borg REAL NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_measurement_corrections ON care_measurement_corrections(measurement_id,created_at);

CREATE TABLE IF NOT EXISTS care_daily_scales(
 id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),performed_date TEXT NOT NULL,
 moment TEXT NOT NULL CHECK(moment IN ('now','before','after')),
 eva INTEGER NOT NULL CHECK(eva BETWEEN 0 AND 100),borg REAL NOT NULL CHECK(borg IN (0,0.5,1,2,3,4,5,6,7,8,9,10)),
 author_id TEXT REFERENCES users(id),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(patient_id,performed_date,moment)
);
CREATE TABLE IF NOT EXISTS care_daily_scale_history(
 id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES care_daily_scales(id),eva INTEGER NOT NULL,borg REAL NOT NULL,
 author_id TEXT REFERENCES users(id),revision INTEGER NOT NULL,created_at TEXT NOT NULL
);
