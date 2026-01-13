/**
 * [FILE: utils/scheduler.js]
 * 역할: 매주 정해진 시간에 자동으로 실행되어 데이터베이스를 청소하고 백업본을 만듭니다.
 * 주요 기능: 매주 월요일 00:00:01에 DB 백업 저장, DB 초기화(Truncate), 주차(Week) 업데이트
 */

// ---------------------------------------------------------
// 1. 필요한 모듈 및 설정 로드
// ---------------------------------------------------------
const schedule = require('node-schedule'); // 특정 시간에 작업을 예약하기 위한 라이브러리 로드
const fs = require('fs');                   // 파일 시스템(읽기/쓰기) 조작을 위한 모듈 로드
const path = require('path');               // 파일 및 폴더 경로 조작을 위한 도구 로드
const db = require('../config/db');         // 상위 폴더의 config/db를 통해 데이터베이스 연결 객체 로드

// ---------------------------------------------------------
// 2. 파일 경로 설정 (경로 변수화)
// ---------------------------------------------------------
// 현재 파일 위치(__dirname) 기준으로 한 칸 위(..)로 이동하여 config/config.json 경로 설정
const configPath = path.join(__dirname, '..', 'config', 'config.json');
// 현재 파일 위치 기준으로 한 칸 위(..)로 이동하여 data 폴더 경로 설정
const dataDir = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------
// 3. 스케줄러 실행 함수 정의
// ---------------------------------------------------------
function startScheduler(){
    /**
     * scheduleJob(시간설정, 실행함수)
     * '1 0 0 * * 1' 의미: 매분(1초), 매시(0분), 매일(0시), 매달(*), 요일(1=월요일)
     * 즉, 매주 월요일 새벽 00시 00분 01초에 정확히 실행됩니다.
     */
    schedule.scheduleJob('1 0 0 * * 6', function() {
        console.log('⏰ [스케줄러] 주간 초기화 작업 시작...');

        // --- [STEP 1: 설정 읽기] ---
        // 현재 운영 정보(연도, 학기, 주차)를 담고 있는 config.json 파일을 읽어옵니다.
        let config = {};
        try {
            // 파일을 동기식(Sync)으로 읽어와서 JSON 객체로 변환합니다.
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            // 파일이 없거나 읽기 실패 시 서버가 꺼지지 않게 기본값을 설정합니다.
            console.error("❌ 설정 파일 로딩 실패, 기본값을 사용합니다.");
            config = { year: 2026, semester: 1, week: 1 };
        }

        // --- [STEP 2: 백업 파일 생성] ---
        // 1) 백업 파일명을 예쁘게 만듭니다 (예: 2026_1학기_1주차_backup.json)
        const backupFileName = `${config.year}_${config.semester}학기_${config.week}주차_backup.json`;
        // 2) data 폴더와 파일명을 합쳐서 전체 백업 경로를 완성합니다.
        const backupPath = path.join(dataDir, backupFileName);

        // 3) 현재 신청자 명단(applications 테이블)을 전부 조회합니다.
        const selectSql = `SELECT * FROM applications`;
    
        db.query(selectSql, (err, rows) => {
            if (err) {
                console.error('❌ 백업 중 DB 조회 실패:', err);
                return; // 에러 발생 시 이후 과정(삭제)을 진행하지 않습니다.
            }

            // 4) 조회된 데이터를 JSON 형식으로 백업 파일에 기록합니다.
            fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
            console.log(`📂 [백업 완료] ${backupFileName} 파일이 저장되었습니다.`);

            // --- [STEP 3: DB 청소] ---
            // 백업이 안전하게 완료되었으니, 신청자 명단 테이블을 싹 비웁니다.
            const deleteSql = `TRUNCATE TABLE applications`;
            db.query(deleteSql, (delErr, result) => {
                if (delErr) {
                    console.error('❌ 데이터 삭제 실패:', delErr);
                } else {
                    console.log('✨ [청소 완료] applications 테이블이 비워졌습니다.');

                    // --- [STEP 4: 주차 정보 업데이트] ---
                    // 1) 주차 숫자를 1 증가시킵니다 (예: 1주차 -> 2주차)
                    config.week += 1; 
                
                    // 2) 변경된 주차 정보를 다시 config.json 파일에 저장합니다.
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    console.log(`🆙 [업데이트 완료] 현재 ${config.week}주차로 변경되었습니다.`);
                }
            });
        });
    });

    // 서버가 켜질 때 스케줄러가 정상 등록되었음을 알리는 로그
    console.log('📅 [시스템] 주간 자동 초기화 스케줄러가 예약되었습니다.');
}

// ---------------------------------------------------------
// 4. 모듈 내보내기
// ---------------------------------------------------------
// server.js에서 이 함수를 호출할 수 있도록 객체 형태로 내보냅니다.
module.exports = { startScheduler };