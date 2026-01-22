/**
 * [FILE: utils/sync_users.js]
 * 역할: CSV 파일 인코딩 및 데이터 확인용 동기화 도구 (업그레이드 Ver)
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// 읽어올 파일 이름
const CSV_FILE_PATH = path.join(__dirname, '..', 'data', 'smash_members_utf8.csv');

function syncUsers() {
    console.log(`\n📂 [진단 시작] 파일 읽는 중... : ${CSV_FILE_PATH}`);

    try {
        const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const lines = fileContent.split(/\r?\n/);

        console.log(`📊 총 ${lines.length}줄 발견됨.\n`);
        console.log(`-------- [데이터 미리보기 (상위 3명)] --------`);

        let successCount = 0;
        
        lines.forEach((line, index) => {
            if (!line.trim()) return;
            // 헤더(user_name 등)가 포함된 줄이면 건너뛰기
            if (index === 0 && (line.includes('name') || line.includes('이름'))) return;

            const parts = line.split(',').map(t => t.trim());
            
            // [중요] 여기서 순서를 확인하세요! (0:이름, 1:학번, 2:비번)
            const name = parts[2];
            const id = parts[1];
            const pwd = parts[3];

            // 미리보기 출력 (이게 깨져 보이면 인코딩 문제입니다!)
            if (index <= 3) {
                console.log(`[${index}행] 이름: ${name} | 학번: ${id}`);
            }

            if (parts.length < 3) return;

            // DB 저장
            const sql = `
                INSERT INTO users (student_id, name, password) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)
            `;
            db.query(sql, [id, name, pwd], (err) => {
                if (!err) successCount++;
            });
        });

        setTimeout(() => {
            console.log(`---------------------------------------------`);
            console.log(`\n🎉 DB 업데이트 완료! (약 ${successCount}명 처리)`);
            console.log(`👉 위 미리보기에서 '이름'이 한글로 잘 나왔나요?`);
            console.log(`   만약 '' 처럼 보이면, 메모장에서 [UTF-8]로 다시 저장해야 합니다.`);
            process.exit();
        }, 1000);

    } catch (err) {
        console.error("🔥 파일 읽기 에러:", err.message);
    }
}

syncUsers();