-- Runs once, when the MySQL data volume is created for the first time
CREATE USER IF NOT EXISTS 'evaluator'@'%' IDENTIFIED BY 'ReadOnly123';
GRANT SELECT ON appdb.* TO 'evaluator'@'%';
FLUSH PRIVILEGES;
