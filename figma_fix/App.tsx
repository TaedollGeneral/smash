import { useState } from 'react';
import { Header } from './components/Header';
import { AccordionPanel } from './components/AccordionPanel';
import { Sidebar } from './components/Sidebar';

type DayType = '수' | '금';
type BoardType = '운동' | '잔여석' | '게스트' | '레슨';

interface User {
  name: string;
  role: string;
}

function App() {
  const [currentDay, setCurrentDay] = useState<DayType>('수');
  const [expandedPanels, setExpandedPanels] = useState<Set<BoardType>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Mock data - 서버에서 받아올 데이터
  const semester = '1';
  const week = '3';

  // 수요일과 금요일에 따른 아코디언 패널 설정 (잔여석은 항상 마지막)
  const accordionPanels: Record<DayType, BoardType[]> = {
    '수': ['운동', '게스트', '레슨', '잔여석'],
    '금': ['운동', '게스트', '잔여석'],
  };

  const togglePanel = (panel: BoardType) => {
    const newExpanded = new Set(expandedPanels);
    if (newExpanded.has(panel)) {
      newExpanded.delete(panel);
    } else {
      newExpanded.add(panel);
    }
    setExpandedPanels(newExpanded);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        setUser={setUser}
      />

      {/* Header */}
      <Header
        semester={semester}
        week={week}
        currentDay={currentDay}
        onDayChange={setCurrentDay}
        onMenuClick={() => setIsSidebarOpen(true)}
        user={user}
      />

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {accordionPanels[currentDay].map((panel) => (
            <AccordionPanel
              key={panel}
              title={panel}
              isExpanded={expandedPanels.has(panel)}
              onToggle={() => togglePanel(panel)}
              deadline="23:59:59"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;