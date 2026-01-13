const express = require('express'); 
const path = require('path');       
const { startScheduler } = require('./utils/scheduler'); // 스케줄러만 부르면 됨
const apiRoutes = require('./routes/api');               // API 라우터만 부르면 됨

const app = express();
const port = 3000;

// 1. 정적 파일 서비스
app.use(express.static(path.join(__dirname, 'public')));

// 2. 미들웨어 설정
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// 3. 라우터 연결 (API 로직은 다 이 안으로 이사 갔음)
app.use('/api', apiRoutes);

// 4. 메인 페이지 접속 (홈페이지 문 열어주기)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. 스케줄러 가동 (이사 간 scheduler.js가 알아서 다 함)
startScheduler(); 

// 6. 서버 가동
app.listen(port, () => {
    console.log(`🚀 서버가 http://localhost:${port} 에서 돌아가고 있습니다.`);
});