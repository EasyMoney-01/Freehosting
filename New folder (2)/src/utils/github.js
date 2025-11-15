import https from "https";

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const { statusCode } = res;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location;
        res.resume();
        fetchBuffer(nextUrl, headers).then(resolve).catch(reject);
        return;
      }
      if (statusCode !== 200) {
        reject(new Error(`http_${statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

export async function downloadRepoZip(repo, ref, token) {
  const base = `https://api.github.com/repos/${repo}/zipball`;
  const url = ref ? `${base}/${encodeURIComponent(ref)}` : base;
  const headers = {
    "User-Agent": "free-host",
    Accept: "application/vnd.github+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return await fetchBuffer(url, headers);
}