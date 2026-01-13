const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // 상위 폴더의 config/db를 불러옴

// 경로 설정
const configPath = path.join(__dirname, '..', 'config', 'config.json');
const dataDir = path.join(__dirname, '..', 'data');

// ==========================================
// 🧹 [자동 청소부] 매주 월요일 새벽 00:00:01 실행
// ==========================================
function startScheduler(){
    schedule.scheduleJob('1 0 0 * * 1', function() {
        console.log('⏰ 주간 초기화 작업 시작...');

        // 1. [설정 읽기] 현재 몇 주차인지 확인
        let config = {};
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.error("설정 파일 로딩 실패, 기본값 사용");
            config = { year: 2026, semester: 1, week: 1 };
        }

        // 2. [백업] 파일명 예쁘게 만들기 (2026_1학기_1주차_backup.json)
        const backupFileName = `${config.year}_${config.semester}학기_${config.week}주차_backup.json`;
        const backupPath = path.join(dataDir, backupFileName);

        const selectSql = `SELECT * FROM applications`;
    
        db.query(selectSql, (err, rows) => {
            if (err) {
                console.error('❌ 백업 중 DB 조회 실패:', err);
                return;
            }

            // 백업 파일 저장
            fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
            console.log(`📂 데이터 백업 완료: ${backupFileName}`);

            // 3. [청소] DB 비우기
            const deleteSql = `TRUNCATE TABLE applications`;
            db.query(deleteSql, (delErr, result) => {
                if (delErr) {
                    console.error('❌ 데이터 삭제 실패:', delErr);
                } else {
                    console.log('✨ DB 초기화 완료!');

                    // 4. [업데이트] 주차 +1 증가시키기 (핵심!)
                    config.week += 1; // 1주차 -> 2주차
                
                    // 다시 메모장에 저장
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    console.log(`🆙 ${config.week}주차로 업데이트 완료!`);
                }
            });
        });
    });
}

module.exports = { startScheduler };