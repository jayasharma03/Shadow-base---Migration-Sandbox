import express from 'express';
import cors from 'cors';
import {config, sourcePool, shadowPool, dbQuery, quoteId} from './db.js';

const app=express();
app.use(cors({origin:['http://localhost:5173','http://127.0.0.1:5173']}));
app.use(express.json({limit:'100kb'}));
const history=[];
const sampleQueries=[
 {name:'List students with department',sql:'SELECT student_id, name, department FROM Student'},
 {name:'Count students',sql:'SELECT COUNT(*) AS total_students FROM Student'},
 {name:'List course enrollments',sql:'SELECT s.name, c.course_name FROM Student s JOIN Enrollment e ON s.student_id=e.student_id JOIN Course c ON c.course_id=e.course_id'},
 {name:'Find MCA students',sql:"SELECT student_id, name FROM Student WHERE department='MCA'"}
];
const record=(type,details)=>{const item={id:`${Date.now()}-${Math.random().toString(16).slice(2,7)}`,type,timestamp:new Date().toISOString(),...details};history.unshift(item);if(history.length>100)history.pop();return item;};
const tableNames=async(pool,db)=>{const [rows]=await dbQuery(pool,'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=? ORDER BY TABLE_NAME',[db,'BASE TABLE']);return rows.map(r=>r.TABLE_NAME);};
const exists=async(pool,db)=>{const [rows]=await dbQuery(pool,'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?',[db]);return rows.length>0;};
function safeMigration(input){
 if(typeof input!=='string'||!input.trim())throw new Error('Enter a migration SQL statement.');
 const sql=input.trim().replace(/;+\s*$/,'');
 if(sql.includes(';'))throw new Error('Run one SQL statement at a time.');
 if(/--|\/\*|\*\//.test(sql))throw new Error('SQL comments are not accepted in this demo.');
 if(!/^(ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX|DROP\s+INDEX|RENAME\s+TABLE)\b/i.test(sql))throw new Error('Allowed migration types: ALTER TABLE, CREATE TABLE, CREATE INDEX, DROP INDEX, RENAME TABLE.');
 return sql;
}
async function seedSource(){
 await dbQuery(sourcePool,`CREATE DATABASE IF NOT EXISTS ${quoteId(config.sourceDb)}`);
 await dbQuery(sourcePool,`CREATE TABLE IF NOT EXISTS ${quoteId(config.sourceDb)}.Student(student_id INT PRIMARY KEY,name VARCHAR(100) NOT NULL,department VARCHAR(50) NOT NULL)`);
 await dbQuery(sourcePool,`CREATE TABLE IF NOT EXISTS ${quoteId(config.sourceDb)}.Course(course_id INT PRIMARY KEY,course_name VARCHAR(100) NOT NULL)`);
 await dbQuery(sourcePool,`CREATE TABLE IF NOT EXISTS ${quoteId(config.sourceDb)}.Enrollment(student_id INT NOT NULL,course_id INT NOT NULL,PRIMARY KEY(student_id,course_id),CONSTRAINT fk_enroll_student FOREIGN KEY(student_id) REFERENCES ${quoteId(config.sourceDb)}.Student(student_id),CONSTRAINT fk_enroll_course FOREIGN KEY(course_id) REFERENCES ${quoteId(config.sourceDb)}.Course(course_id))`);
 await dbQuery(sourcePool,`INSERT INTO ${quoteId(config.sourceDb)}.Student VALUES (101,'Rahul Sharma','MCA'),(102,'Priya Singh','BCA'),(103,'Aman Verma','MCA') ON DUPLICATE KEY UPDATE name=VALUES(name),department=VALUES(department)`);
 await dbQuery(sourcePool,`INSERT INTO ${quoteId(config.sourceDb)}.Course VALUES (1,'Database Systems'),(2,'Java Programming') ON DUPLICATE KEY UPDATE course_name=VALUES(course_name)`);
 await dbQuery(sourcePool,`INSERT IGNORE INTO ${quoteId(config.sourceDb)}.Enrollment VALUES (101,1),(101,2),(102,1),(103,2)`);
}
app.get('/api/health',async(_req,res)=>{try{await dbQuery(sourcePool,'SELECT 1');await dbQuery(shadowPool,'SELECT 1');res.json({ok:true,message:'API and both MySQL connections are ready.'});}catch(e){res.status(503).json({ok:false,message:e.message});}});
app.get('/api/status',async(_req,res)=>{try{const [v]=await dbQuery(sourcePool,'SELECT VERSION() version');const se=await exists(sourcePool,config.sourceDb),he=await exists(shadowPool,config.shadowDb);res.json({connected:true,mysqlVersion:v[0].version,sourceDb:config.sourceDb,shadowDb:config.shadowDb,sourceExists:se,shadowExists:he,sourceTables:se?await tableNames(sourcePool,config.sourceDb):[],shadowTables:he?await tableNames(shadowPool,config.shadowDb):[]});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/demo/reset',async(_req,res)=>{try{for(const t of ['Enrollment','Course','Student']){try{await dbQuery(sourcePool,`DROP TABLE IF EXISTS ${quoteId(config.sourceDb)}.${quoteId(t)}`);}catch{}}await seedSource();record('demo-reset',{message:'Source demo tables and sample rows recreated.'});res.json({message:'Demo source schema and data created.',tables:await tableNames(sourcePool,config.sourceDb)});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/shadow/clone',async(_req,res)=>{
 try{
  if(!(await exists(sourcePool,config.sourceDb)))return res.status(400).json({error:'Source database does not exist. Reset demo data first.'});
  const tables=await tableNames(sourcePool,config.sourceDb);
  if(!tables.length)return res.status(400).json({error:'Source database has no tables.'});
  const sh=quoteId(config.shadowDb);
  const target=await shadowPool.getConnection();
  try{
   await target.query(`CREATE DATABASE IF NOT EXISTS ${sh}`);
   await target.query('SET FOREIGN_KEY_CHECKS=0');
   try{
    for(const t of await tableNames(shadowPool,config.shadowDb))await target.query(`DROP TABLE ${sh}.${quoteId(t)}`);
    for(const t of tables){
     const [rows]=await dbQuery(sourcePool,`SHOW CREATE TABLE ${quoteId(config.sourceDb)}.${quoteId(t)}`);
     const create=rows[0]['Create Table'];
     const body=create.slice(create.indexOf('('));
     await target.query(`CREATE TABLE ${sh}.${quoteId(t)} ${body}`);
    }
    for(const t of tables){
     const [rows]=await dbQuery(sourcePool,`SELECT * FROM ${quoteId(config.sourceDb)}.${quoteId(t)}`);
     if(!rows.length)continue;
     const columns=Object.keys(rows[0]);
     const values=rows.map(row=>columns.map(column=>row[column]));
     await target.query(`INSERT INTO ${sh}.${quoteId(t)} (${columns.map(quoteId).join(',')}) VALUES ?`,[values]);
    }
   }finally{
    await target.query('SET FOREIGN_KEY_CHECKS=1');
   }
  }finally{
   target.release();
  }
  record('clone',{message:'Source tables and rows cloned to shadow.',tables});
  res.json({message:'Shadow clone completed.',tables});
 }catch(e){
  res.status(500).json({error:e.message});
 }
});
app.post('/api/migrations/test',async(req,res)=>{let sql='';try{sql=safeMigration(req.body?.sql);if(!(await exists(shadowPool,config.shadowDb)))return res.status(400).json({error:'Clone source to shadow before testing a migration.'});const start=Date.now();await dbQuery(shadowPool,`USE ${quoteId(config.shadowDb)}`);await dbQuery(shadowPool,sql);const item=record('migration',{sql,success:true,durationMs:Date.now()-start,message:'Migration applied to shadow database only.'});res.json({...item,tables:await tableNames(shadowPool,config.shadowDb)});}catch(e){const item=record('migration',{sql:sql||req.body?.sql||'',success:false,error:e.message,message:'Migration failed on the shadow database.'});res.status(400).json(item);}});
app.post('/api/queries/check',async(_req,res)=>{try{if(!(await exists(shadowPool,config.shadowDb)))return res.status(400).json({error:'Clone source to shadow first.'});await dbQuery(shadowPool,`USE ${quoteId(config.shadowDb)}`);const results=[];for(const t of sampleQueries){const start=Date.now();try{const [rows]=await dbQuery(shadowPool,t.sql);results.push({name:t.name,sql:t.sql,success:true,durationMs:Date.now()-start,rowCount:rows.length});}catch(e){results.push({name:t.name,sql:t.sql,success:false,durationMs:Date.now()-start,error:e.message});}}const summary={total:results.length,passed:results.filter(x=>x.success).length,failed:results.filter(x=>!x.success).length};record('query-check',{...summary,results});res.json({...summary,results});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/history',(_req,res)=>res.json(history));
app.post('/api/cdc/register',async(_req,res)=>{try{const base=config.connectUrl;const payload={name:'shadowbase-mysql-connector',config:{'connector.class':'io.debezium.connector.mysql.MySqlConnector','database.hostname':'source-mysql','database.port':'3306','database.user':'debezium','database.password':'dbz','database.server.id':'184054','topic.prefix':'shadowbase','database.include.list':config.sourceDb,'schema.history.internal.kafka.bootstrap.servers':'kafka:9092','schema.history.internal.kafka.topic':'shadowbase_schema_history','include.schema.changes':'true'}};let r=await fetch(`${base}/connectors`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(r.status===409){r=await fetch(`${base}/connectors/${payload.name}/config`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.config)});}const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||JSON.stringify(data)||`Kafka Connect HTTP ${r.status}`);record('cdc-register',{message:'Debezium connector registered.',connector:payload.name});res.json({message:'Debezium connector registered. It may take a short time to start.',connector:payload.name,result:data});}catch(e){res.status(502).json({error:`Could not register CDC connector: ${e.message}. Check that Docker Compose and Kafka Connect are ready.`});}});
app.get('/api/cdc/status',async(_req,res)=>{try{const r=await fetch(`${config.connectUrl}/connectors/shadowbase-mysql-connector/status`);if(!r.ok)throw new Error(`Kafka Connect returned ${r.status}`);const data=await r.json();res.json(data);}catch(e){res.status(502).json({error:e.message});}});
app.delete('/api/cdc/connector',async(_req,res)=>{try{const r=await fetch(`${config.connectUrl}/connectors/shadowbase-mysql-connector`,{method:'DELETE'});if(!r.ok&&r.status!==404)throw new Error(`Kafka Connect returned ${r.status}`);record('cdc-remove',{message:'Debezium connector removed.'});res.json({message:'CDC connector removed.'});}catch(e){res.status(502).json({error:e.message});}});
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`ShadowBase API running at http://localhost:${port}`));
