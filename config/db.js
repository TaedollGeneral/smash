/**
 * [FILE: config/db.js]
 * 역할: 서비스 운영에 필요한 모든 데이터가 저장된 MySQL 데이터베이스와의 통로를 개설합니다.
 * 수정사항: 안정성을 위해 단일 연결(Connection)에서 풀링(Pool) 방식으로 변경했습니다.
 */

const mysql = require('mysql2');

// ---------------------------------------------------------
// 1. MySQL(DB) 커넥션 풀 설정 (자동 재연결 기능 포함)
// ---------------------------------------------------------
const pool = mysql.createPool({
    host: 'localhost',       
    user: 'taedoll',         
    password: '1234',        
    database: 'smash_db',
    waitForConnections: true,    // 연결이 다 찼을 때 대기 여부
    connectionLimit: 10,         // 동시에 유지할 최대 연결 수
    queueLimit: 0,               // 대기열 제한 없음
    enableKeepAlive: true,       // 연결 유지를 위한 패킷 주기적 발송
    keepAliveInitialDelay: 10000 // 10초마다 연결 확인
});

// ---------------------------------------------------------
// 2. 연결 테스트 및 오류 로그 출력
// ---------------------------------------------------------
// 풀링 방식은 직접 connect()를 호출하지 않아도 쿼리 시 자동으로 연결되지만,
// 서버 시작 시 상태를 확인하기 위해 테스트 로그를 남깁니다.
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ [DATABASE] 연결 실패! MySQL 서버가 꺼져있거나 설정이 틀렸습니다.');
        console.error('상세 에러:', err.message);
    } else {
        console.log('✅ [DATABASE] 커넥션 풀 생성 완료! 자동 재연결 모드로 작동 중입니다.');
        connection.release(); // 테스트 후 연결 반환
    }
});

// ---------------------------------------------------------
// 3. 풀 객체 내보내기
// ---------------------------------------------------------
// 이제 api.js 등에서 이 pool 객체를 통해 db.query()를 날리면 안전하게 작동합니다.
module.exports = pool;