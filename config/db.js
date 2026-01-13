const mysql = require('mysql2');

// 1. MySql(DB) 연결 설정 (열쇠)
const db = mysql.createConnection
({
    host: 'localhost',       // 내 컴퓨터
    user: 'taedoll',            // 기본 관리자 ID
    password: '1234',        // ⚠️ 여기를 설치할 때 정한 비밀번호로 바꾸세요!!
    database: 'smash_db'     // 아까 만든 데이터베이스 이름
});

// 2. 데이터베이스 연결 시도
db.connect((err) => {
    if (err) {
        console.error('❌ DB 연결 실패! 비밀번호나 DB이름을 확인하세요.', err);
        return;
    }
    console.log('✅ MySQL 데이터베이스 연결 성공!');
});

module.exports = db; // 이 연결 객체를 다른 파일에서 쓸 수 있게 내보냄