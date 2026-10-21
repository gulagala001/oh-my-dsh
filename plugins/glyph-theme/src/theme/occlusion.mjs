// A glyph only checks nearby rectangles, not every line in the transcript.
export function createOcclusionIndex(rectangles, width, height) {
  const step=64,cols=Math.max(1,Math.ceil(width/step)),rows=Math.max(1,Math.ceil(height/step));
  const cells=new Array(cols*rows);
  for(const r of rectangles) {
    const x0=Math.max(0,Math.floor(r.left/step)),x1=Math.min(cols-1,Math.floor(r.right/step));
    const y0=Math.max(0,Math.floor(r.top/step)),y1=Math.min(rows-1,Math.floor(r.bottom/step));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)(cells[y*cols+x]??=[]).push(r);
  }
  return (x,y)=>{
    const col=Math.floor(x/step),row=Math.floor(y/step);
    if(col<0||col>=cols||row<0||row>=rows)return false;
    return cells[row*cols+col]?.some(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)??false;
  };
}
