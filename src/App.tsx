/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, Component } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, PlusCircle, Users, UserCheck, Lock, LogIn, Phone, Download, Camera, Scan, X } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, doc, setDoc, getDoc, onSnapshot, Timestamp, collection, signInAnonymously } from './firebase';
import type { User as FirebaseUser } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-200 text-center space-y-4">
            <AlertCircle size={64} className="text-red-500 mx-auto" />
            <h2 className="text-2xl font-black text-gray-900">Đã có lỗi xảy ra</h2>
            <p className="text-gray-600">Hệ thống gặp sự cố không mong muốn. Vui lòng tải lại trang hoặc liên hệ quản trị viên.</p>
            <div className="p-4 bg-gray-50 rounded-lg text-left overflow-auto max-h-40">
              <code className="text-xs text-red-600">{this.state.error?.message}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ElectionLevel = 'Quốc hội' | 'HĐND Tỉnh' | 'HĐND Xã (Phường)';

interface CandidateData {
  name: string;
  votes: number[];
}

interface User {
  uid: string;
  email: string | null;
  name: string;
  photoURL: string | null;
}

interface LevelData {
  numCandidates: number;
  numDelegates: number;
  numFiles: number;
  candidates: CandidateData[];
  checkVotes: number[];
}

const CameraScanner = ({ 
  onScan, 
  onClose, 
  numCandidates, 
  numDelegates 
}: { 
  onScan: (votes: number[]) => void; 
  onClose: () => void;
  numCandidates: number;
  numDelegates: number;
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.");
        onClose();
      }
    }
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    // Reduce quality to 0.7 to speed up upload and analysis without losing critical detail
    const base64Image = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: `Identify votes for ${numCandidates} candidates. Exactly ${numDelegates} votes required.` },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }
        ],
        config: { 
          systemInstruction: "You are a high-speed ballot scanner. ONLY report what is explicitly marked in the image. DO NOT invent candidates or votes. If exactly " + numDelegates + " votes are not clearly visible, mark isValid as false. Output ONLY JSON.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isValid: { type: Type.BOOLEAN },
              votes: { 
                type: Type.ARRAY, 
                items: { type: Type.INTEGER },
                description: `Array of exactly ${numCandidates} integers (1 for voted, 0 for not)`
              }
            },
            required: ["isValid", "votes"]
          }
        }
      });

      const result = JSON.parse(response.text);
      if (result.isValid && result.votes.filter((v: number) => v === 1).length === numDelegates) {
        onScan(result.votes);
      } else {
        alert("Phiếu không hợp lệ hoặc không đúng số lượng bầu (Cần bầu " + numDelegates + "). Vui lòng thử lại.");
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
      alert("Lỗi khi phân tích hình ảnh. Vui lòng thử lại.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-lg aspect-[3/4] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-blue-500">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
          <div className="w-full h-full border-2 border-dashed border-white/50 rounded-lg" />
        </div>

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
        >
          <X size={24} />
        </button>

        {isAnalyzing && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white space-y-4">
            <RefreshCw size={48} className="animate-spin text-blue-400" />
            <p className="font-bold text-lg animate-pulse">Đang phân tích phiếu...</p>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col items-center space-y-4 w-full max-w-md">
        <p className="text-white/70 text-sm text-center">
          Đưa phiếu vào khung hình và nhấn nút để quét.<br/>
          Yêu cầu bầu đúng <span className="text-blue-400 font-bold">{numDelegates}</span> người.
        </p>
        <button
          onClick={captureAndAnalyze}
          disabled={isAnalyzing}
          className="w-full flex items-center justify-center gap-3 p-5 bg-blue-600 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
        >
          <Scan size={28} />
          {isAnalyzing ? 'Đang xử lý...' : 'CHỤP & QUÉT PHIẾU'}
        </button>
      </div>
    </div>
  );
};

const GAS_URL = ""; // Dán URL Web App từ Apps Script vào đây

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [level, setLevel] = useState<ElectionLevel>('Quốc hội');
  
  const [electionData, setElectionData] = useState<Record<ElectionLevel, LevelData>>({
    'Quốc hội': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
    'HĐND Tỉnh': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
    'HĐND Xã (Phường)': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
  });

  const isRemoteUpdate = useRef(false);
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  const { numCandidates, numDelegates, numFiles, candidates, checkVotes } = electionData[level];

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const levels: ElectionLevel[] = ['Quốc hội', 'HĐND Tỉnh', 'HĐND Xã (Phường)'];

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [targetTepIndex, setTargetTepIndex] = useState(0);

  // Firebase Auth Listener (Dùng để duy trì session Firebase cho sync)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      // Nếu đã login qua GAS thì không cần quan tâm user Firebase ở đây
      // trừ khi muốn dùng uid của nó.
      setIsAuthReady(true);
    });
    
    // Kiểm tra session cũ từ localStorage
    const savedUser = localStorage.getItem('election_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
    
    return () => unsubscribe();
  }, []);

  // Firebase Real-time Sync (Listen for changes)
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    const sanitizedEmail = currentUser.email?.replace(/[.#$[\]]/g, '_') || 'unknown';

    const unsubscribes = levels.map(lvl => {
      const path = `users/${sanitizedEmail}/levels/${lvl}`;
      return onSnapshot(doc(db, 'users', sanitizedEmail, 'levels', lvl), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          isRemoteUpdate.current = true;
          setElectionData(prev => ({
            ...prev,
            [lvl]: {
              ...prev[lvl],
              numCandidates: data.numCandidates,
              numDelegates: data.numDelegates,
              candidates: data.candidates,
              checkVotes: data.checkVotes
            }
          }));
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      }, (error) => {
        // handleFirestoreError(error, OperationType.GET, path);
        console.error("Sync error:", error);
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [isLoggedIn, currentUser?.email]);

  // Save to Firebase when local data changes
  useEffect(() => {
    if (!isLoggedIn || !currentUser || isRemoteUpdate.current) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      const sanitizedEmail = currentUser.email?.replace(/[.#$[\]]/g, '_') || 'unknown';
      const path = `users/${sanitizedEmail}/levels/${level}`;
      try {
        const currentData = electionData[level];
        if (currentData.candidates.length === 0) return;

        await setDoc(doc(db, 'users', sanitizedEmail, 'levels', level), {
          numCandidates: currentData.numCandidates,
          numDelegates: currentData.numDelegates,
          candidates: currentData.candidates,
          checkVotes: currentData.checkVotes,
          updatedAt: Timestamp.now()
        }, { merge: true });
      } catch (error) {
        // handleFirestoreError(error, OperationType.WRITE, path);
        console.error("Save error:", error);
      }
    }, 1000); // Debounce saves

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [electionData, level, isLoggedIn, currentUser?.email]);

  const handleScanSuccess = (votes: number[]) => {
    setElectionData(prev => {
      const current = prev[level];
      const newCandidates = current.candidates.map((c, i) => {
        const newVotes = [...c.votes];
        if (votes[i] === 1) {
          newVotes[targetTepIndex] = (newVotes[targetTepIndex] || 0) + 1;
        }
        return { ...c, votes: newVotes };
      });

      const newCheckVotes = [...current.checkVotes];
      newCheckVotes[targetTepIndex] = (newCheckVotes[targetTepIndex] || 0) + 1;

      return {
        ...prev,
        [level]: {
          ...prev[level],
          candidates: newCandidates,
          checkVotes: newCheckVotes
        }
      };
    });
    setMessage({ text: "Đã quét và cộng phiếu thành công!", type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!GAS_URL) {
      setLoginError("Chưa cấu hình GAS_URL. Vui lòng dán URL Web App vào code.");
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'login',
          email: loginEmail,
          password: loginPassword
        })
      });

      const result = await response.json();

      if (result.success) {
        const userData: User = {
          uid: result.user.email, // Dùng email làm UID
          email: result.user.email,
          name: result.user.name,
          photoURL: null
        };
        
        setCurrentUser(userData);
        setIsLoggedIn(true);
        localStorage.setItem('election_user', JSON.stringify(userData));
        
        // Login ẩn danh vào Firebase để có session cho Firestore sync
        try {
          await signInAnonymously(auth); 
        } catch (fbErr) {
          console.error("Firebase anonymous login failed:", fbErr);
        }
      } else {
        setLoginError(result.message || "Đăng nhập thất bại");
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Lỗi kết nối đến Server Google Sheet");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('election_user');
    await signOut(auth);
  };

  useEffect(() => {
    const current = electionData[level];
    
    // Check if we need to initialize or resize
    const needsCandidateResize = current.candidates.length !== current.numCandidates;
    const needsVoteResize = current.candidates.some(c => c.votes.length !== current.numFiles);
    const needsCheckVoteResize = current.checkVotes.length !== current.numFiles;

    if (needsCandidateResize || needsVoteResize || needsCheckVoteResize) {
      const newCandidates = Array.from({ length: current.numCandidates }, (_, i) => ({
        name: current.candidates[i]?.name || `Ứng cử viên ${i + 1}`,
        votes: Array.from({ length: current.numFiles }, (_, j) => current.candidates[i]?.votes[j] || 0)
      }));
      
      const newCheckVotes = Array.from({ length: current.numFiles }, (_, j) => current.checkVotes[j] || 0);
      
      setElectionData(prev => ({
        ...prev,
        [level]: {
          ...prev[level],
          candidates: newCandidates,
          checkVotes: newCheckVotes
        }
      }));
    }
  }, [level, electionData[level].numCandidates, electionData[level].numFiles]);

  const handleCandidateNameChange = (index: number, name: string) => {
    setElectionData(prev => {
      const newCandidates = [...prev[level].candidates];
      newCandidates[index] = { ...newCandidates[index], name };
      return {
        ...prev,
        [level]: { ...prev[level], candidates: newCandidates }
      };
    });
  };

  const handleVoteChange = (candidateIndex: number, fileIndex: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setElectionData(prev => {
      const newCandidates = [...prev[level].candidates];
      const newVotes = [...newCandidates[candidateIndex].votes];
      newVotes[fileIndex] = numValue;
      newCandidates[candidateIndex] = { ...newCandidates[candidateIndex], votes: newVotes };
      return {
        ...prev,
        [level]: { ...prev[level], candidates: newCandidates }
      };
    });
  };

  const handleCheckVoteChange = (fileIndex: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setElectionData(prev => {
      const newCheckVotes = [...prev[level].checkVotes];
      newCheckVotes[fileIndex] = numValue;
      return {
        ...prev,
        [level]: { ...prev[level], checkVotes: newCheckVotes }
      };
    });
  };

  const addMoreFiles = () => {
    setElectionData(prev => ({
      ...prev,
      [level]: { ...prev[level], numFiles: prev[level].numFiles + 50 }
    }));
  };

  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    (Object.entries(electionData) as [ElectionLevel, LevelData][]).forEach(([lvl, data]) => {
      if (data.candidates.length === 0) return;

      // Prepare data for this sheet
      const sheetData = [];
      
      // Header row: STT, Tên ứng cử viên, Tổng cộng, Phiếu 1, Phiếu 2...
      const headers = ['STT', 'Tên ứng cử viên', 'Tổng cộng'];
      for (let i = 0; i < data.numFiles; i++) {
        headers.push(`Phiếu ${i + 1}`);
      }
      sheetData.push(headers);

      // Check votes row
      const checkRow = ['', 'Số phiếu kiểm tra', ''];
      data.checkVotes.forEach(v => checkRow.push(v.toString()));
      sheetData.push(checkRow);

      // Candidates rows
      data.candidates.forEach((c, idx) => {
        const row = [
          idx + 1,
          c.name,
          c.votes.reduce((a, b) => a + b, 0)
        ];
        c.votes.forEach(v => row.push(v));
        sheetData.push(row);
      });

      // Column totals row
      const colTotalsRow = ['', 'Tổng số phiếu theo cột', ''];
      const colTotals = Array(data.numFiles).fill(0);
      data.candidates.forEach(c => {
        c.votes.forEach((v, i) => {
          if (i < data.numFiles) colTotals[i] += v;
        });
      });
      colTotals.forEach(t => colTotalsRow.push(t));
      sheetData.push(colTotalsRow);

      // Add percentage column to sheetData (optional, but requested for UI)
      // Since sheetData is already built, let's insert it into the rows
      const totalCV = data.checkVotes.reduce((a, b) => a + b, 0);
      sheetData[0].splice(3, 0, '%'); // Header
      sheetData[1].splice(3, 0, ''); // Check votes row
      data.candidates.forEach((c, idx) => {
        const candidateTotal = c.votes.reduce((a, b) => a + b, 0);
        const percentage = totalCV > 0 ? ((candidateTotal / totalCV) * 100).toFixed(2) + '%' : '0%';
        sheetData[idx + 2].splice(3, 0, percentage);
      });
      sheetData[sheetData.length - 1].splice(3, 0, ''); // Col totals row

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, lvl);
    });

    if (workbook.SheetNames.length === 0) {
      setMessage({ text: "Không có dữ liệu để xuất!", type: 'error' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    XLSX.writeFile(workbook, `Ket_Qua_Bau_Cu_${new Date().toISOString().split('T')[0]}.xlsx`);
    setMessage({ text: "Đã tải file Excel thành công!", type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  const rowTotals = useMemo(() => {
    return candidates.map(c => c.votes.reduce((sum, v) => sum + v, 0));
  }, [candidates]);

  const totalCheckVotes = useMemo(() => {
    return checkVotes.reduce((sum, v) => sum + v, 0);
  }, [checkVotes]);

  const colTotals = useMemo(() => {
    const totals = Array(numFiles).fill(0);
    candidates.forEach(c => {
      c.votes.forEach((v, i) => {
        if (i < numFiles) totals[i] += v;
      });
    });
    return totals;
  }, [candidates, numFiles]);

  const validationResults = useMemo(() => {
    return colTotals.map((total, i) => {
      const checkVal = checkVotes[i];
      if (checkVal === 0) return total === 0;
      const isTotalCorrect = total === (checkVal * numDelegates);
      const hasInvalidCandidate = candidates.some(c => c.votes[i] > checkVal);
      return isTotalCorrect && !hasInvalidCandidate;
    });
  }, [colTotals, checkVotes, candidates, numDelegates]);

  const isGrandTotalValid = useMemo(() => {
    const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
    if (totalCheckVotes === 0) return grandTotal === 0;
    return grandTotal === (totalCheckVotes * numDelegates);
  }, [rowTotals, totalCheckVotes, numDelegates]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <RefreshCw size={48} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 text-blue-600 rounded-full mb-2">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Đăng nhập hệ thống</h1>
            <p className="text-gray-500 text-sm">Vui lòng nhập Email và Mật khẩu được cấp trên Google Sheet</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                <LogIn size={16} className="text-blue-500" /> Email (Gmail)
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                placeholder="example@gmail.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                <Lock size={16} className="text-blue-500" /> Mật khẩu
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                placeholder="Nhập mật khẩu..."
                required
              />
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} /> {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? <RefreshCw size={20} className="animate-spin" /> : <LogIn size={20} />}
              {isLoggingIn ? 'Đang kiểm tra...' : 'Đăng nhập'}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-gray-100 text-center space-y-1">
            <div className="text-xs text-gray-400 font-medium">Hệ Thống Kiểm Phiếu Bầu Cử v2.0</div>
            <div className="text-sm font-bold text-blue-600">Bản quyền: Đào Minh Tâm - Zalo: 0366000555</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6 font-sans flex flex-col">
      <div className="max-w-[100vw] mx-auto space-y-6 flex-grow">
        {/* Header & Config Section */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">
                Hệ Thống Kiểm Phiếu Bầu Cử
              </h1>
              <p className="text-xs font-bold text-blue-600">Bản quyền: Đào Minh Tâm - Zalo: 0366000555</p>
            </div>

            {currentUser && (
              <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 shadow-sm">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt={currentUser.name} className="w-10 h-10 rounded-full shadow-md" />
                ) : (
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shadow-md">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-black text-gray-900 leading-tight">{currentUser.name}</div>
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                    Đã kết nối
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 bg-gray-100 p-1.5 rounded-xl">
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "flex-1 min-w-[120px] px-3 py-3 rounded-lg font-bold transition-all text-sm md:text-base",
                    level === l 
                      ? "bg-white text-blue-600 shadow-md scale-[1.02]" 
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 pt-4 border-t border-gray-100">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[10px] md:text-sm font-bold text-gray-700 uppercase">
                <Users size={14} className="text-blue-500" />
                Số ứng cử
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                value={numCandidates}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setElectionData(prev => ({
                  ...prev,
                  [level]: { ...prev[level], numCandidates: Math.max(1, parseInt(e.target.value) || 0) }
                }))}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-base md:text-lg h-12 md:h-14"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[10px] md:text-sm font-bold text-gray-700 uppercase">
                <UserCheck size={14} className="text-green-500" />
                Cần bầu
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={numDelegates}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setElectionData(prev => ({
                  ...prev,
                  [level]: { ...prev[level], numDelegates: Math.max(1, parseInt(e.target.value) || 0) }
                }))}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-bold text-base md:text-lg h-12 md:h-14"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[10px] md:text-sm font-bold text-gray-700 uppercase">
                <Scan size={14} className="text-purple-500" />
                Tệp số
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={numFiles}
                value={targetTepIndex + 1}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setTargetTepIndex(Math.max(0, Math.min(numFiles - 1, (parseInt(e.target.value) || 1) - 1)))}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-base md:text-lg h-12 md:h-14"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 flex items-end">
              <button
                onClick={addMoreFiles}
                className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-2 md:p-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 h-12 md:h-14"
              >
                <PlusCircle size={18} />
                <span className="text-[10px] md:text-sm">Thêm tệp</span>
              </button>
              <button
                onClick={() => setIsScannerOpen(true)}
                className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-2 md:p-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg active:scale-95 h-12 md:h-14"
              >
                <Camera size={18} />
                <span className="text-[10px] md:text-sm">Quét AI</span>
              </button>
            </div>
          </div>
        </div>

        {isScannerOpen && (
          <CameraScanner 
            numCandidates={numCandidates}
            numDelegates={numDelegates}
            onScan={handleScanSuccess}
            onClose={() => setIsScannerOpen(false)}
          />
        )}

        {/* Table Container with Horizontal Scroll */}
        <div className="bg-white rounded-xl shadow-2xl border border-gray-300 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full border-collapse text-xs md:text-sm table-fixed">
              <thead className="sticky top-0 z-20">
                {/* Main Header */}
                <tr className="bg-[#ffc000] text-black font-bold uppercase text-[10px] md:text-xs">
                  <th className="border border-black p-1 md:p-2 w-8 md:w-12 sticky left-0 z-30 bg-[#ffc000]">TT</th>
                  <th className="border border-black p-1 md:p-2 w-40 md:w-64 sticky left-8 md:left-12 z-30 bg-[#ffc000]">Họ và tên ứng cử viên</th>
                  <th className="border border-black p-1 md:p-2 w-16 md:w-24 sticky left-[192px] md:left-[304px] z-30 bg-[#ffc000] text-center">CỘNG</th>
                  <th className="border border-black p-1 md:p-2 w-14 md:w-20 sticky left-[256px] md:left-[400px] z-30 bg-[#ffc000] text-center">%</th>
                  {Array.from({ length: numFiles }).map((_, i) => (
                    <th key={i} className="border border-black p-1 md:p-2 w-16 md:w-20 min-w-[60px] md:min-w-[80px]">Tệp {i + 1}</th>
                  ))}
                </tr>
                
                {/* Row: Số phiếu kiểm tra */}
                <tr className="bg-white text-[10px] md:text-xs">
                  <td className="border border-black p-1 md:p-2 text-center font-bold sticky left-0 z-10 bg-white">#</td>
                  <td className="border border-black p-1 md:p-2 text-red-600 font-bold italic sticky left-8 md:left-12 z-10 bg-white">Số phiếu kiểm tra</td>
                  <td className="border border-black p-1 md:p-2 text-center font-bold text-red-600 bg-yellow-50 sticky left-[192px] md:left-[304px] z-10">
                    {totalCheckVotes}
                  </td>
                  <td className="border border-black p-1 md:p-2 text-center font-bold text-red-600 bg-yellow-50 sticky left-[256px] md:left-[400px] z-10">
                    -
                  </td>
                  {checkVotes.map((val, i) => (
                    <td key={i} className="border border-black p-0">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={val || ''}
                        onChange={(e) => handleCheckVoteChange(i, e.target.value)}
                        className="w-full h-full p-1 md:p-2 text-center text-red-600 font-bold border-none focus:ring-0 outline-none bg-transparent"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              </thead>
              
              <tbody className="text-[10px] md:text-sm">
                {candidates.map((candidate, cIdx) => (
                  <tr key={cIdx} className="hover:bg-gray-50 group">
                    <td className="border border-black p-1 md:p-2 text-center font-medium text-gray-400 sticky left-0 z-10 bg-white group-hover:bg-gray-50">
                      {cIdx + 1}
                    </td>
                    <td className="border border-black p-0 sticky left-8 md:left-12 z-10 bg-white group-hover:bg-gray-50">
                      <input
                        type="text"
                        value={candidate.name}
                        onChange={(e) => handleCandidateNameChange(cIdx, e.target.value)}
                        className="w-full p-1 md:p-2 font-semibold text-gray-800 border-none focus:ring-0 outline-none bg-transparent"
                        placeholder={`Tên ${cIdx + 1}`}
                      />
                    </td>
                    <td className="border border-black p-1 md:p-2 text-center font-bold bg-yellow-50 text-blue-700 sticky left-[192px] md:left-[304px] z-10 group-hover:bg-yellow-100">
                      {rowTotals[cIdx]}
                    </td>
                    <td className="border border-black p-1 md:p-2 text-center font-bold bg-blue-50 text-blue-800 sticky left-[256px] md:left-[400px] z-10 group-hover:bg-blue-100">
                      {totalCheckVotes > 0 ? ((rowTotals[cIdx] / totalCheckVotes) * 100).toFixed(1) : '0.0'}%
                    </td>
                    {candidate.votes.map((vote, vIdx) => (
                      <td key={vIdx} className="border border-black p-0">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={vote || ''}
                          onChange={(e) => handleVoteChange(cIdx, vIdx, e.target.value)}
                          className={cn(
                            "w-full h-full p-1 md:p-2 text-center border-none focus:ring-1 focus:ring-blue-300 outline-none transition-all",
                            vote > checkVotes[vIdx] && checkVotes[vIdx] > 0 ? "bg-red-100 text-red-600 font-bold" : "bg-transparent"
                          )}
                          placeholder="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 z-20 bg-gray-100 font-bold text-[10px] md:text-xs">
                {/* Tổng số phiếu */}
                <tr className="bg-gray-100">
                  <td className="border border-black p-1 md:p-2 sticky left-0 z-10 bg-gray-100"></td>
                  <td className="border border-black p-1 md:p-2 text-red-600 font-bold uppercase sticky left-8 md:left-12 z-10 bg-gray-100">Tổng số phiếu</td>
                  <td className="border border-black p-1 md:p-2 text-center font-bold text-red-600 bg-red-50 sticky left-[192px] md:left-[304px] z-10">
                    {rowTotals.reduce((a, b) => a + b, 0)}
                  </td>
                  <td className="border border-black p-1 md:p-2 text-center font-bold text-red-600 bg-red-50 sticky left-[256px] md:left-[400px] z-10">
                    -
                  </td>
                  {colTotals.map((total, i) => (
                    <td key={i} className="border border-black p-1 md:p-2 text-center font-bold text-red-600">
                      {total}
                    </td>
                  ))}
                </tr>

                {/* Kiểm tra Đúng/Sai */}
                <tr className="bg-[#ffc000]">
                  <td className="border border-black p-1 md:p-2 sticky left-0 z-10 bg-[#ffc000]"></td>
                  <td className="border border-black p-1 md:p-2 font-bold uppercase sticky left-8 md:left-12 z-10 bg-[#ffc000]">Kiểm tra Đúng/Sai</td>
                  <td className={cn(
                    "border border-black p-1 md:p-2 text-center font-black sticky left-[192px] md:left-[304px] z-10",
                    isGrandTotalValid ? "text-green-700" : "text-red-700"
                  )}>
                    {isGrandTotalValid ? "ĐÚNG" : "SAI"}
                  </td>
                  <td className="border border-black p-1 md:p-2 sticky left-[256px] md:left-[400px] z-10 bg-[#ffc000]"></td>
                  {validationResults.map((isValid, i) => (
                    <td 
                      key={i} 
                      className={cn(
                        "border border-black p-1 md:p-2 text-center font-black",
                        isValid ? "text-black" : "text-red-600"
                      )}
                    >
                      {isValid ? "Đúng" : "Sai"}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-center justify-between bg-white p-4 md:p-6 rounded-xl shadow-md border border-gray-200">
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-4 w-full md:w-auto">
            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 px-4 md:px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg active:scale-95 text-xs md:text-base"
            >
              <Download size={18} />
              <span className="hidden md:inline">Tải file Excel</span>
              <span className="md:hidden">Excel</span>
            </button>

            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 px-4 md:px-6 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-95 text-xs md:text-base"
            >
              <RefreshCw size={18} />
              <span className="hidden md:inline">Làm mới trang</span>
              <span className="md:hidden">Làm mới</span>
            </button>
            
            <button
              onClick={handleLogout}
              className="col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-4 md:px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95 text-xs md:text-base"
            >
              Đăng xuất
            </button>
          </div>

          {message && (
            <div className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-lg shadow-inner",
              message.type === 'success' ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
            )}>
              {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              {message.text}
            </div>
          )}
        </div>
      </div>

      {/* Footer Copyright */}
      <footer className="mt-8 py-6 text-center border-t border-gray-200 bg-white">
        <p className="text-sm font-black text-blue-600 uppercase tracking-widest">
          Bản quyền: Đào Minh Tâm - Zalo: 0366000555
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}} />
    </div>
  );
}
