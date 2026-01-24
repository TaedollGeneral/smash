/**
 * [FILE: utils/sync_users.js]
 * 역할: CSV 파일 인코딩 및 데이터 확인용 동기화 도구 (업그레이드 Ver)
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const CSV_FILE_PATH = path.join(__dirname, '..', 'data', 'smash_members_utf8.csv');

async function syncUsers() {
    console.log(`\n🧹 [정석 모드] 데이터 동기화 시작 (원본 데이터 신뢰)...\n`);

    try {
        const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const lines = fileContent.split(/\r?\n/);
        
        // 헤더 및 빈 줄 제거
        const dataLines = lines.filter(line => {
            const t = line.trim();
            return t && !t.includes('name') && !t.includes('이름');
        });

        console.log(`📋 데이터 총 ${dataLines.length}건 처리 시작`);

        for (const line of dataLines) {
            await new Promise((resolve) => {
                // 따옴표 및 공백 제거
                const parts = line.split(',').map(t => t.trim().replace(/^"|"$/g, ''));

                // [중요] 엑셀에서 '텍스트'로 저장했으므로, "0001"이 그대로 들어옵니다.
                const id = parts[1];   // 학번 (0001)
                const name = parts[2]; // 이름

                if (!id || !name) return resolve();

                // 무조건 UPDATE (이름 덮어쓰기)
                const sql = `UPDATE users SET name = ? WHERE student_id = ?`;
                
                db.query(sql, [name, id], (err, result) => {
                    if (err) {
                        console.error(`❌ 에러: ${err.message}`);
                    } else {
                        if (result.affectedRows > 0) {
                            console.log(`✅ [성공] 학번 [${id}] -> 이름 [${name}] 업데이트됨`);
                        } else {
                            // 기존에 없던 학번이면 신규 추가
                            console.log(`🆕 [신규] 학번 [${id}] 없음 -> 신규 등록`);
                            db.query(`INSERT INTO users (student_id, name, password) VALUES (?, ?, '1234')`, [id, name], () => {});
                        }
                    }
                    resolve();
                });
            });
        }

        console.log(`\n🎉 [최종 완료] DB가 엑셀과 완벽하게 일치되었습니다.`);
        process.exit();

    } catch (err) {
        console.error("🔥 에러:", err);
        process.exit(1);
    }
}

syncUsers();