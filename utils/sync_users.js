/**
 * [FILE: utils/sync_users.js]
 * 역할: CSV 파일을 읽어서 DB(users 테이블)에 최신화하는 도구
 * 사용법: node utils/sync_users.js
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// 읽어올 파일 이름 (새로 만드신 utf8 파일을 읽도록 설정)
const CSV_FILE_PATH = path.join(__dirname, '..', 'data', 'smash_members_utf8.csv');

function syncUsers() {
    console.log(`📂 파일 읽는 중... : ${CSV_FILE_PATH}`);

    try {
        const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const lines = fileContent.split(/\r?\n/); // 줄바꿈으로 자르기

        let successCount = 0;
        let failCount = 0;

        console.log(`총 ${lines.length}명의 데이터를 발견했습니다. DB 동기화 시작...`);

        lines.forEach((line, index) => {
            if (!line.trim()) return; // 빈 줄 패스
            if (index === 0 && line.includes('name')) return; // 헤더(제목줄) 패스

            // CSV 형식: 이름,학번,비밀번호 (콤마로 구분된다고 가정)
            // 만약 순서가 다르다면 아래 순서를 바꿔주세요! [0]=이름, [1]=학번, [2]=비번
            const parts = line.split(',').map(text => text.trim());
            
            if (parts.length < 3) return;

            const name = parts[0];
            const id = parts[1];
            const pwd = parts[2];

            // DB에 집어넣기 (이미 있으면 정보 업데이트)
            const sql = `
                INSERT INTO users (student_id, name, password) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)
            `;

            db.query(sql, [id, name, pwd], (err) => {
                if (err) {
                    console.error(`❌ 실패 (${name}): ${err.message}`);
                    failCount++;
                } else {
                    // 너무 많이 출력되면 지저분하니까 10명 단위로만 로그
                    // console.log(`✅ 성공: ${name}`); 
                    successCount++;
                }
            });
        });

        // 비동기 쿼리라 정확한 완료 시점 로그가 어려울 수 있으니 시간차 안내
        setTimeout(() => {
            console.log(`\n🎉 동기화 작업이 완료되었습니다!`);
            console.log(`(대략 ${successCount}명 처리됨)\n`);
            console.log(`이제 웹사이트에서 신청해보세요!`);
            process.exit();
        }, 2000);

    } catch (err) {
        console.error("🔥 파일 읽기 에러:", err.message);
    }
}

syncUsers();