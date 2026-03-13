import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Giả lập dữ liệu từ Google Sheets cho 3 cấp
  const mockData = {
    "Quốc hội": {
      numDelegates: 3,
      candidates: ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C", "Phạm Văn D", "Hoàng Thị E"]
    },
    "HĐND Tỉnh": {
      numDelegates: 4,
      candidates: ["Trịnh Văn X", "Lý Thị Y", "Vũ Văn Z", "Đặng Thị K", "Bùi Văn M", "Ngô Thị N"]
    },
    "HĐND Phường": {
      numDelegates: 2,
      candidates: ["Đỗ Văn P", "Tô Thị Q", "Mai Văn R"]
    }
  };

  // API lấy danh sách ứng cử viên
  app.get("/api/candidates/:level", (req, res) => {
    const level = req.params.level;
    const data = mockData[level];
    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: "Không tìm thấy cấp bầu cử" });
    }
  });

  // API lưu dữ liệu
  app.post("/api/save", (req, res) => {
    console.log("Dữ liệu nhận được:", req.body);
    res.json({ success: true, message: "Dữ liệu đã được lưu (Giả lập)" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
