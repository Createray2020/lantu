import { describe, it, expect } from "vitest";
import { embedUrl, LESSON_KINDS } from "./learn";

// 影片連結轉內嵌網址。認不出來就回 null（畫面改成「用新分頁開啟」），
// 絕不硬塞一個 iframe —— 那會變成一個永遠轉圈圈、完全沒有線索的空白框。
describe("embedUrl", () => {
  it("YouTube 的四種常見寫法", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(embedUrl("https://youtu.be/abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(embedUrl("https://www.youtube.com/embed/abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(embedUrl("https://www.youtube.com/shorts/abc123")).toBe("https://www.youtube.com/embed/abc123");
  });

  it("watch 連結帶了播放清單與時間參數也認得出來", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=abc123&list=PL9&t=30s"))
      .toBe("https://www.youtube.com/embed/abc123");
  });

  it("Vimeo", () => {
    expect(embedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(embedUrl("https://player.vimeo.com/video/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("Google 雲端硬碟的檔案連結轉成 preview", () => {
    expect(embedUrl("https://drive.google.com/file/d/1AbC/view?usp=sharing"))
      .toBe("https://drive.google.com/file/d/1AbC/preview");
  });

  it("認不出來的一律回 null，不硬塞 iframe", () => {
    expect(embedUrl("https://example.com/movie.mp4")).toBeNull();
    expect(embedUrl("https://drive.google.com/drive/folders/xyz")).toBeNull();
    expect(embedUrl("不是網址")).toBeNull();
    expect(embedUrl("")).toBeNull();
    expect(embedUrl(null)).toBeNull();
  });

  it("YouTube 沒帶影片 id 不會回一個壞掉的 embed 網址", () => {
    expect(embedUrl("https://www.youtube.com/watch")).toBeNull();
    expect(embedUrl("https://youtu.be/")).toBeNull();
  });
});

describe("單元型態", () => {
  it("四種：影片／文件／外部連結／文字講義", () => {
    expect(LESSON_KINDS.map((k) => k.value)).toEqual(["video", "doc", "link", "text"]);
  });
});
