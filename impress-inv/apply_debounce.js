const fs = require('fs');
const path = require('path');
const dir = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/master-entries';

const files = fs.readdirSync(dir);
for (const file of files) {
  const fullPath = path.join(dir, file, 'page.tsx');
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    if (content.includes('useDebounce')) continue;

    if (content.includes('import { useForm } from')) {
      content = content.replace('import { useForm } from "@/hooks/useForm";', 'import { useForm } from "@/hooks/useForm";\nimport useDebounce from "@/hooks/useDebounce";');
    }

    const nextIdRegex = /const \[nextId, setNextId\] = useState<string>\(.*?([^;]*)\);/;
    if (nextIdRegex.test(content)) {
        content = content.replace(nextIdRegex, (match) => match + '\n    const debouncedId = useDebounce(values?.id, 500);');
    }

    const handleIdBlurStart = content.indexOf('const handleIdBlur = async () => {');
    if (handleIdBlurStart !== -1) {
        let braceCount = 0;
        let handleIdBlurEnd = -1;
        let started = false;
        for (let i = handleIdBlurStart; i < content.length; i++) {
            if (content[i] === '{') {
                braceCount++;
                started = true;
            } else if (content[i] === '}') {
                braceCount--;
            }
            if (started && braceCount === 0) {
                handleIdBlurEnd = i + 1;
                break;
            }
        }
        
        if (handleIdBlurEnd !== -1) {
            let funcBody = content.substring(handleIdBlurStart, handleIdBlurEnd);
            
            let useEffectBody = funcBody.replace('const handleIdBlur = async () => {', 'useEffect(() => {\n        const fetchDebouncedId = async () => {');
            useEffectBody = useEffectBody.replace(/if \(!values\.id\)/g, 'if (!debouncedId)');
            useEffectBody = useEffectBody.replace(/values\.id === nextId/g, 'debouncedId === String(nextId)');
            useEffectBody = useEffectBody.replace(/\$\{values\.id\}/g, '${debouncedId}');
            
            useEffectBody += '\n        fetchDebouncedId();\n    }, [debouncedId]);'; // Added proper closing
            
            content = content.substring(0, handleIdBlurStart) + useEffectBody + content.substring(handleIdBlurEnd);
            content = content.replace(/onBlur=\{handleIdBlur\}\n?\s*/g, '');
            
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log('Processed', fullPath);
        }
    }
  }
}
