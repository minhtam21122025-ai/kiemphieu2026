/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, PlusCircle, Users, UserCheck, Lock, LogIn, Phone, Download } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ElectionLevel = 'Quốc hội' | 'HĐND Tỉnh' | 'HĐND Xã (Phường)';

interface CandidateData {
  name: string;
  votes: number[];
}

interface User {
  phone: string;
  name: string;
  role: string;
}

interface LevelData {
  numCandidates: number;
  numDelegates: number;
  numFiles: number;
  candidates: CandidateData[];
  checkVotes: number[];
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [level, setLevel] = useState<ElectionLevel>('Quốc hội');
  
  const [electionData, setElectionData] = useState<Record<ElectionLevel, LevelData>>({
    'Quốc hội': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
    'HĐND Tỉnh': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
    'HĐND Xã (Phường)': { numCandidates: 5, numDelegates: 3, numFiles: 200, candidates: [], checkVotes: [] },
  });

  const { numCandidates, numDelegates, numFiles, candidates, checkVotes } = electionData[level];

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const levels: ElectionLevel[] = ['Quốc hội', 'HĐND Tỉnh', 'HĐND Xã (Phường)'];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    // 1. Kiểm tra qua Google Apps Script (Nếu có cấu hình URL)
    // Bạn dán URL Web App của Google Script vào đây
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwNGmsC0460QYAEL6ALosoT3A_AWhDpZNZpcOaepObUuMnxsWOCMLKSlOI3D_elqUeF/exec"; 

    if (GAS_URL) {
      try {
        const response = await fetch(GAS_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'login',
            phone: loginPhone,
            password: loginPassword
          })
        });
        const result = await response.json();
        if (result.success) {
          setCurrentUser(result.user);
          setIsLoggedIn(true);
        } else {
          setLoginError(result.message || 'Thông tin đăng nhập không chính xác');
        }
      } catch (error) {
        setLoginError('Không thể kết nối với máy chủ xác thực!');
      }
    } else {
      setLoginError('Số điện thoại hoặc mật khẩu không chính xác!');
    }
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 text-blue-600 rounded-full mb-2">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Đăng nhập hệ thống</h1>
            <p className="text-gray-500 text-sm">Vui lòng nhập thông tin để truy cập phần mềm kiểm phiếu</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                <Phone size={16} /> Số điện thoại
              </label>
              <input
                type="text"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                placeholder="Nhập số điện thoại..."
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
                <Lock size={16} /> Mật khẩu
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
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm font-bold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} /> {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
            >
              <LogIn size={20} /> Đăng nhập
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
                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shadow-md">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-black text-gray-900 leading-tight">{currentUser.name}</div>
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                    {currentUser.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "px-4 py-2 rounded-lg font-bold transition-all text-sm",
                    level === l 
                      ? "bg-white text-blue-600 shadow-sm" 
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase">
                <Users size={16} className="text-blue-500" />
                Số người ứng cử
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={numCandidates}
                onChange={(e) => setElectionData(prev => ({
                  ...prev,
                  [level]: { ...prev[level], numCandidates: Math.max(1, parseInt(e.target.value) || 0) }
                }))}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase">
                <UserCheck size={16} className="text-green-500" />
                Số người cần bầu
              </label>
              <input
                type="number"
                min="1"
                value={numDelegates}
                onChange={(e) => setElectionData(prev => ({
                  ...prev,
                  [level]: { ...prev[level], numDelegates: Math.max(1, parseInt(e.target.value) || 0) }
                }))}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-bold text-lg"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={addMoreFiles}
                className="w-full flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
              >
                <PlusCircle size={20} />
                Thêm 50 tệp (Hiện có: {numFiles})
              </button>
            </div>
          </div>
        </div>

        {/* Table Container with Horizontal Scroll */}
        <div className="bg-white rounded-xl shadow-2xl border border-gray-300 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full border-collapse text-xs md:text-sm table-fixed">
              <thead className="sticky top-0 z-20">
                {/* Main Header */}
                <tr className="bg-[#ffc000] text-black font-bold uppercase">
                  <th className="border border-black p-2 w-12 sticky left-0 z-30 bg-[#ffc000]">TT</th>
                  <th className="border border-black p-2 w-64 sticky left-12 z-30 bg-[#ffc000]">Họ và tên ứng cử viên</th>
                  <th className="border border-black p-2 w-24 sticky left-[304px] z-30 bg-[#ffc000] text-center">CỘNG</th>
                  <th className="border border-black p-2 w-20 sticky left-[400px] z-30 bg-[#ffc000] text-center">%</th>
                  {Array.from({ length: numFiles }).map((_, i) => (
                    <th key={i} className="border border-black p-2 w-20 min-w-[80px]">Tệp {i + 1}</th>
                  ))}
                </tr>
                
                {/* Row: Số phiếu kiểm tra */}
                <tr className="bg-white">
                  <td className="border border-black p-2 text-center font-bold sticky left-0 z-10 bg-white">#</td>
                  <td className="border border-black p-2 text-red-600 font-bold italic sticky left-12 z-10 bg-white">Số phiếu kiểm tra</td>
                  <td className="border border-black p-2 text-center font-bold text-red-600 bg-yellow-50 sticky left-[304px] z-10">
                    {totalCheckVotes}
                  </td>
                  <td className="border border-black p-2 text-center font-bold text-red-600 bg-yellow-50 sticky left-[400px] z-10">
                    -
                  </td>
                  {checkVotes.map((val, i) => (
                    <td key={i} className="border border-black p-0">
                      <input
                        type="number"
                        value={val || ''}
                        onChange={(e) => handleCheckVoteChange(i, e.target.value)}
                        className="w-full h-full p-2 text-center text-red-600 font-bold border-none focus:ring-0 outline-none bg-transparent"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              </thead>
              
              <tbody>
                {candidates.map((candidate, cIdx) => (
                  <tr key={cIdx} className="hover:bg-gray-50 group">
                    <td className="border border-black p-2 text-center font-medium text-gray-400 sticky left-0 z-10 bg-white group-hover:bg-gray-50">
                      {cIdx + 1}
                    </td>
                    <td className="border border-black p-0 sticky left-12 z-10 bg-white group-hover:bg-gray-50">
                      <input
                        type="text"
                        value={candidate.name}
                        onChange={(e) => handleCandidateNameChange(cIdx, e.target.value)}
                        className="w-full p-2 font-semibold text-gray-800 border-none focus:ring-0 outline-none bg-transparent"
                        placeholder={`Tên ứng cử viên ${cIdx + 1}`}
                      />
                    </td>
                    <td className="border border-black p-2 text-center font-bold bg-yellow-50 text-blue-700 sticky left-[304px] z-10 group-hover:bg-yellow-100">
                      {rowTotals[cIdx]}
                    </td>
                    <td className="border border-black p-2 text-center font-bold bg-blue-50 text-blue-800 sticky left-[400px] z-10 group-hover:bg-blue-100">
                      {totalCheckVotes > 0 ? ((rowTotals[cIdx] / totalCheckVotes) * 100).toFixed(2) : '0.00'}%
                    </td>
                    {candidate.votes.map((vote, vIdx) => (
                      <td key={vIdx} className="border border-black p-0">
                        <input
                          type="number"
                          min="0"
                          value={vote || ''}
                          onChange={(e) => handleVoteChange(cIdx, vIdx, e.target.value)}
                          className={cn(
                            "w-full h-full p-2 text-center border-none focus:ring-1 focus:ring-blue-300 outline-none transition-all",
                            vote > checkVotes[vIdx] && checkVotes[vIdx] > 0 ? "bg-red-100 text-red-600 font-bold" : "bg-transparent"
                          )}
                          placeholder="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 z-20">
                {/* Tổng số phiếu */}
                <tr className="bg-gray-100">
                  <td className="border border-black p-2 sticky left-0 z-10 bg-gray-100"></td>
                  <td className="border border-black p-2 text-red-600 font-bold uppercase sticky left-12 z-10 bg-gray-100">Tổng số phiếu</td>
                  <td className="border border-black p-2 text-center font-bold text-red-600 bg-red-50 sticky left-[304px] z-10">
                    {rowTotals.reduce((a, b) => a + b, 0)}
                  </td>
                  <td className="border border-black p-2 text-center font-bold text-red-600 bg-red-50 sticky left-[400px] z-10">
                    -
                  </td>
                  {colTotals.map((total, i) => (
                    <td key={i} className="border border-black p-2 text-center font-bold text-red-600">
                      {total}
                    </td>
                  ))}
                </tr>

                {/* Kiểm tra Đúng/Sai */}
                <tr className="bg-[#ffc000]">
                  <td className="border border-black p-2 sticky left-0 z-10 bg-[#ffc000]"></td>
                  <td className="border border-black p-2 font-bold uppercase sticky left-12 z-10 bg-[#ffc000]">Kiểm tra Đúng/Sai</td>
                  <td className={cn(
                    "border border-black p-2 text-center font-black sticky left-[304px] z-10",
                    isGrandTotalValid ? "text-green-700" : "text-red-700"
                  )}>
                    {isGrandTotalValid ? "ĐÚNG" : "SAI"}
                  </td>
                  <td className="border border-black p-2 sticky left-[400px] z-10 bg-[#ffc000]"></td>
                  {validationResults.map((isValid, i) => (
                    <td 
                      key={i} 
                      className={cn(
                        "border border-black p-2 text-center font-black",
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
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-xl shadow-md border border-gray-200">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg active:scale-95"
            >
              <Download size={20} />
              Tải file Excel
            </button>

            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-95"
            >
              <RefreshCw size={20} />
              Làm mới trang
            </button>
            
            <button
              onClick={() => {
                setIsLoggedIn(false);
                setCurrentUser(null);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
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
