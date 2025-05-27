export async function extractPDF(): Promise<string | null> {
    // PDFファイルを読み込む
    const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const response = await fetch(pdfUrl);
    const pdfBlob = await response.blob();
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfData = new Uint8Array(pdfArrayBuffer);

    // PDFをstringに変換
    return await pdfToString(pdfData);
}

//MEMO：とりあえず仮で作成　CDN以外で何か良いやり方は無いか？
async function pdfToString(pdfData: Uint8Array): Promise<string | null> {
    try {
        // PDF.jsを使用してPDFをテキストに変換
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

        const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
        let textContent = '';

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();
            textContent += content.items.map((item: any) => item.str).join(' ') + '\n';
        }

        return textContent;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return null;
    }
}