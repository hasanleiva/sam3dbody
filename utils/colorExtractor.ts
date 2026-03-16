export const extractColorsFromImage = async (base64Image: string): Promise<{ jersey: string, shorts: string, socks: string, body: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ jersey: '#ffffff', shorts: '#ffffff', socks: '#ffffff', body: '#ffccaa' });
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const getAverageColor = (yStart: number, yEnd: number, xStart: number = 0.3, xEnd: number = 0.7) => {
        const startY = Math.floor(img.height * yStart);
        const endY = Math.floor(img.height * yEnd);
        const startX = Math.floor(img.width * xStart);
        const endX = Math.floor(img.width * xEnd);
        
        const width = endX - startX;
        const height = endY - startY;
        
        if (width <= 0 || height <= 0) return '#ffffff';
        
        const imageData = ctx.getImageData(startX, startY, width, height);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          // Skip transparent or very dark/light pixels if needed, but simple average is fine for now
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        
        if (count === 0) return '#ffffff';
        
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      };
      
      // Heuristics for body parts based on vertical position
      // Face/Skin: top 5-15%
      const body = getAverageColor(0.05, 0.15, 0.4, 0.6);
      // Jersey: 20-45%
      const jersey = getAverageColor(0.20, 0.45, 0.3, 0.7);
      // Shorts: 50-70%
      const shorts = getAverageColor(0.50, 0.70, 0.3, 0.7);
      // Socks: 75-90%
      const socks = getAverageColor(0.75, 0.90, 0.3, 0.7);
      
      resolve({ jersey, shorts, socks, body });
    };
    img.onerror = () => {
      resolve({ jersey: '#ffffff', shorts: '#ffffff', socks: '#ffffff', body: '#ffccaa' });
    };
    img.src = base64Image;
  });
};
