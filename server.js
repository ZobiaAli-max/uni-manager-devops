const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'appdb',
  waitForConnections: true,
  connectionLimit: 10
});

const schema = [
  `CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    department VARCHAR(80),
    semester INT)`,
  `CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(120) NOT NULL,
    credit_hours INT NOT NULL,
    instructor VARCHAR(100))`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    grade VARCHAR(3),
    UNIQUE KEY uq_enroll (student_id, course_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE)`
];

async function initDb() {
  try {
    for (const sql of schema) await pool.query(sql);
    const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM students');
    if (c === 0) {
      await pool.query("INSERT INTO students (name,email,department,semester) VALUES ('Ayesha Khan','ayesha@example.com','Data Science',7),('Ali Raza','ali@example.com','Computer Science',5),('Sara Ahmed','sara@example.com','Data Science',7)");
      await pool.query("INSERT INTO courses (code,title,credit_hours,instructor) VALUES ('CS401','DevOps for Cloud Computing',3,'Dr. Imran'),('CS402','Machine Learning',3,'Dr. Hina'),('CS403','Databases',3,'Dr. Bilal')");
      await pool.query("INSERT INTO enrollments (student_id,course_id,grade) VALUES (1,1,'A'),(1,2,'B+'),(2,3,NULL)");
    }
    console.log('Database ready');
  } catch (e) {
    console.error('DB init failed:', e.message);
  }
}

const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate entry (already exists)' });
    if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Invalid student_id or course_id' });
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));

app.get('/api/stats', wrap(async (req, res) => {
  const [[s]] = await pool.query('SELECT COUNT(*) n FROM students');
  const [[c]] = await pool.query('SELECT COUNT(*) n FROM courses');
  const [[e]] = await pool.query('SELECT COUNT(*) n FROM enrollments');
  res.json({ students: s.n, courses: c.n, enrollments: e.n });
}));

// enrollments list with names (join)
app.get('/api/enrollments', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.id, e.student_id, e.course_id, e.grade, s.name AS student_name, c.title AS course_title
     FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id ORDER BY e.id`);
  res.json(rows);
}));

function crud(name, table, fields, required) {
  const base = `/api/${name}`;
  app.get(base, wrap(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
    res.json(rows);
  }));
  app.get(`${base}/:id`, wrap(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }));
  app.post(base, wrap(async (req, res) => {
    for (const f of required)
      if (req.body[f] === undefined || req.body[f] === '') return res.status(400).json({ error: `${f} is required` });
    const vals = fields.map(f => (req.body[f] === '' || req.body[f] === undefined) ? null : req.body[f]);
    const [r] = await pool.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, vals);
    res.status(201).json({ id: r.insertId });
  }));
  app.put(`${base}/:id`, wrap(async (req, res) => {
    for (const f of required)
      if (req.body[f] === undefined || req.body[f] === '') return res.status(400).json({ error: `${f} is required` });
    const vals = fields.map(f => (req.body[f] === '' || req.body[f] === undefined) ? null : req.body[f]);
    const [r] = await pool.query(`UPDATE ${table} SET ${fields.map(f => f + '=?').join(',')} WHERE id=?`, [...vals, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ updated: true });
  }));
  app.delete(`${base}/:id`, wrap(async (req, res) => {
    const [r] = await pool.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  }));
}

crud('students', 'students', ['name', 'email', 'department', 'semester'], ['name', 'email']);
crud('courses', 'courses', ['code', 'title', 'credit_hours', 'instructor'], ['code', 'title', 'credit_hours']);
crud('enrollments', 'enrollments', ['student_id', 'course_id', 'grade'], ['student_id', 'course_id']);

const PORT = process.env.PORT || 8080;
initDb().then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)));
