const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const schedule = require('node-schedule'); // 추가된 부품
const fs = require('fs');                  // 추가된 부품
const app = express();
const port = 3000;


// 1. MySQL 연결 설정 (냉장고 열쇠)
const db = mysql.createConnection({
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

// 3. 정적 파일 서비스 (HTML, CSS, JS 파일을 손님에게 보여줌)
app.use(express.static(__dirname));
app.use(express.json()); // JSON 데이터 해석 장착
app.use(express.urlencoded({ extended: true })); // 폼 데이터 해석 장착







// ==========================================
// [API] 신청하기 (APPLY 요청 처리) : 시간 체크 + 비번 체크 + 중복신청 체크
// ==========================================

app.post('/api/apply', (req, res) => {
    const { id, pwd, category, name, day } = req.body; 

    // 1. [시간 검증]
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) return res.json({ success: false, message: timeCheck.msg });

    // 2. [본인 확인]
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });
        if (users.length === 0) return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });

        // 신청자 실명 확보
        const realName = users[0].name;

        // 3. [★중복 검사★] 해당 요일(day)에 같은 카테고리(category)를 이미 신청했는지 확인
        const dupSql = `SELECT * FROM applications WHERE student_id = ? AND day = ? AND category = ?`;
        
        db.query(dupSql, [id, day, category], (dupErr, dupRows) => {
            if (dupErr) return res.status(500).json({ success: false, message: '중복 확인 중 에러' });

            // 이미 데이터가 있다면? -> 중복! 삐- 🙅‍♂️
            if (dupRows.length > 0) {
                // 친절하게 무슨 요일, 무슨 종목인지 알려줌
                const korCategory = (category === 'exercise') ? '운동' : (category === 'guest' ? '게스트' : '레슨');
                return res.json({ success: false, message: `이미 [${day} ${korCategory}] 신청 내역이 있습니다.` });
            }

            // 4. [저장] 중복 아님! 이제 진짜 저장
            const insertSql = `INSERT INTO applications (student_id, day, category, guest_name) VALUES (?, ?, ?, ?)`;
            
            db.query(insertSql, [id, day, category, name], (insertErr, result) => {
                if (insertErr) return res.status(500).json({ success: false, message: '저장 에러' });

                res.json({ 
                    success: true, 
                    message: '신청이 완료되었습니다!',
                    category: category, 
                    userName: realName, 
                    guestName: name, 
                    day: day
                });
            });
        });
    });
});



// ==========================================
// [API] 신청 취소하기 (DELETE 요청 처리)
// ==========================================

app.post('/api/cancel', (req, res) => {
    // ★ [수정] day(요일) 정보도 같이 받습니다.
    const { id, pwd, category, day } = req.body;

    // [추가] 시간 검증 ⛔
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) {
        return res.json({ success: false, message: timeCheck.msg });
    }

    // 1. 본인 확인
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });

        if (users.length === 0) {
            return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });
        }

        // 2. 삭제 진행 (조건 강화)
        // ★ [수정] 학번, 카테고리 뿐만 아니라 '요일(day)'도 맞아야 지웁니다!
        const deleteSql = `DELETE FROM applications WHERE student_id = ? AND category = ? AND day = ?`;

        db.query(deleteSql, [id, category, day], (delErr, result) => {
            if (delErr) return res.status(500).json({ success: false, message: '삭제 중 에러 발생' });

            if (result.affectedRows === 0) {
                return res.json({ success: false, message: '해당 요일에 신청한 내역이 없습니다.' });
            }

            console.log(`🗑️ 취소 완료: ${id} (${category}, ${day})`);
            res.json({ success: true, message: '취소가 완료되었습니다.' });
        });
    });
});


// ==========================================
// 🧹 [자동 청소부] 매주 월요일 새벽 00:00:01 실행
// ==========================================
const job = schedule.scheduleJob('1 0 0 * * 1', function() {
    console.log('⏰ 주간 초기화 작업 시작...');

    // 1. [설정 읽기] 현재 몇 주차인지 확인
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } catch (e) {
        console.error("설정 파일 로딩 실패, 기본값 사용");
        config = { year: 2026, semester: 1, week: 1 };
    }

    // 2. [백업] 파일명 예쁘게 만들기 (2026_1학기_1주차_backup.json)
    const backupFileName = `${config.year}_${config.semester}학기_${config.week}주차_backup.json`;

    const selectSql = `SELECT * FROM applications`;
    
    db.query(selectSql, (err, rows) => {
        if (err) {
            console.error('❌ 백업 중 DB 조회 실패:', err);
            return;
        }

        // 백업 파일 저장
        fs.writeFileSync(backupFileName, JSON.stringify(rows, null, 2));
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
                fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
                console.log(`🆙 ${config.week}주차로 업데이트 완료!`);
            }
        });
    });
});


// ==========================================
// 🕒 [시간 검증 함수] 신청/취소 가능 여부 판독기
// ==========================================
function checkTimeParams(targetDay, category) {
    const now = new Date();
    const day = now.getDay(); // 0(일) ~ 6(토)
    const hour = now.getHours();

    // 1. 토요일 22시 이전(00:00 ~ 21:59)은 무조건 "금지 구역" (오픈 전)
    // (단, 토요일이라도 금요일 게스트 마감 직후인 00시~21시59분은 닫혀있어야 함)
    if (day === 6 && hour < 22) {
        return { valid: false, msg: "지금은 투표 시간이 아닙니다. (토요일 22시 오픈)" };
    }

    // 2. 요일별/카테고리별 마감 시간 체크
    // 우리가 막아야 할 '금지 요일'을 정의합니다.
    
    if (targetDay === 'WED') {
        if (category === 'guest') {
            // [수요일 게스트]: 수 24시(목 00시) 마감
            // -> 목(4), 금(5) 이면 신청 불가
            if (day === 4 || day === 5) return { valid: false, msg: "수요일 게스트 신청이 마감되었습니다." };
        } else {
            // [수요일 일반]: 화 24시(수 00시) 마감
            // -> 수(3), 목(4), 금(5) 이면 신청 불가
            if (day === 3 || day === 4 || day === 5) return { valid: false, msg: "수요일 투표가 마감되었습니다." };
        }
    } 
    else if (targetDay === 'FRI') {
        if (category === 'guest') {
            // [금요일 게스트]: 금 24시(토 00시) 마감
            // -> 이미 위에서 '토요일 22시 전'을 막았으므로 추가 체크 불필요!
            // (금요일 23:59까지 통과, 토요일 00:00부터는 위 1번 조건에 걸림)
            // 통과!
        } else {
            // [금요일 일반]: 목 24시(금 00시) 마감
            // -> 금(5) 이면 신청 불가
            if (day === 5) return { valid: false, msg: "금요일 투표가 마감되었습니다." };
        }
    }

    return { valid: true };
}


// 4. 서버 가동 (가게 문 열기)
app.listen(port, () => {
    console.log(`🚀 서버가 http://localhost:${port} 에서 돌아가고 있습니다.`);
});


// [API] 현황판 데이터 주기 (GET 요청)
// script.js가 2초마다 이걸 호출해서 명단을 가져갑니다.
app.get('/api/status', (req, res) => {

    // 1. 프론트엔드가 요청한 요일(?day=WED)을 확인합니다.
    const day = req.query.day || 'WED';

    // 2. 해당 요일(day)에 해당하는 신청자만 DB에서 가져옵니다.
    const sql = `
        SELECT a.category, u.name as user_name, a.guest_name, a.student_id, a.created_at 
        FROM applications a
        JOIN users u ON a.student_id = u.student_id
        WHERE a.day = ? 
        ORDER BY a.created_at ASC
    `;

    db.query(sql, [day], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send('DB Error');
        } else {
            res.json(results); // 가져온 데이터를 그대로 돌려줌
        }
    });
});

// [API] 현재 주차 정보 알려주기 (프론트엔드용)
app.get('/api/info', (req, res) => {
    try {
        // 메모장을 읽어서 손님(웹페이지)한테 보여줌
        const configData = fs.readFileSync('config.json', 'utf8');
        const config = JSON.parse(configData);
        res.json(config);
    } catch (err) {
        console.error("설정 파일 읽기 실패:", err);
        res.status(500).json({ error: "Config Error" });
    }
});