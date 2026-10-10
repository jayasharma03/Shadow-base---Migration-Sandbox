CREATE DATABASE IF NOT EXISTS shadowbase_source;
USE shadowbase_source;

CREATE TABLE IF NOT EXISTS Student (
  student_id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  department VARCHAR(50) NOT NULL
);
CREATE TABLE IF NOT EXISTS Course (
  course_id INT PRIMARY KEY,
  course_name VARCHAR(100) NOT NULL
);
CREATE TABLE IF NOT EXISTS Enrollment (
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  PRIMARY KEY (student_id, course_id),
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES Student(student_id),
  CONSTRAINT fk_enroll_course FOREIGN KEY (course_id) REFERENCES Course(course_id)
);
INSERT IGNORE INTO Student VALUES (101,'Rahul Sharma','MCA'),(102,'Priya Singh','BCA'),(103,'Aman Verma','MCA');
INSERT IGNORE INTO Course VALUES (1,'Database Systems'),(2,'Java Programming');
INSERT IGNORE INTO Enrollment VALUES (101,1),(101,2),(102,1),(103,2);

CREATE USER IF NOT EXISTS 'debezium'@'%' IDENTIFIED WITH caching_sha2_password BY 'dbz';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT, LOCK TABLES ON *.* TO 'debezium'@'%';
FLUSH PRIVILEGES;
