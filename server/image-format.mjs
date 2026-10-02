// Only raster formats; derive MIME and dimensions from the bytes, never the filename.
export function imageFormat(b){
 let width,height,mime,ext;
 if(b.length>=45&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  if(b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR')throw new Error('PNG inválido.');
  width=b.readUInt32BE(16);height=b.readUInt32BE(20);let pos=8,ended=false,data=false;
  while(pos+12<=b.length){const size=b.readUInt32BE(pos);if(size>b.length-pos-12)throw new Error('PNG incompleto.');const type=b.toString('ascii',pos+4,pos+8);if(type==='IDAT')data=true;pos+=size+12;if(type==='IEND'){ended=true;break}}
  if(!ended||!data||pos!==b.length)throw new Error('PNG incompleto.');mime='image/png';ext='png';
 }else if(b.length>=12&&b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217){
  let pos=2;while(pos<b.length-2){if(b[pos++]!==255)throw new Error('JPEG inválido.');while(b[pos]===255)pos++;const marker=b[pos++];if(marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(pos+2>b.length)break;const size=b.readUInt16BE(pos);if(size<2||pos+size>b.length)throw new Error('JPEG incompleto.');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(size<8)throw new Error('JPEG inválido.');height=b.readUInt16BE(pos+3);width=b.readUInt16BE(pos+5)}pos+=size}
  mime='image/jpeg';ext='jpg';
 }else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'&&b.readUInt32LE(4)+8===b.length){
  const type=b.toString('ascii',12,16);
  if(type==='VP8X'){if(b[20]&2)throw new Error('Envie uma imagem estática.');width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3)}
  else if(type==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=b.readUInt16LE(26)&16383;height=b.readUInt16LE(28)&16383}
  else if(type==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);width=1+(bits&16383);height=1+((bits>>>14)&16383)}
  mime='image/webp';ext='webp';
 }else throw new Error('Envie uma imagem JPG, PNG ou WebP válida.');
 if(!width||!height||width>16000||height>16000||width*height>30000000)throw new Error('Imagem inválida ou muito grande: máximo de 30 megapixels.');
 return {width,height,mime,ext};
}
