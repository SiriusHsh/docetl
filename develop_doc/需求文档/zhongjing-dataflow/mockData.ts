import { Pipeline, OperationType, OperationStep, DataSource } from './types';

// Pipeline 1: Linux kernel CVE Distillation
const cveDistillationSteps: OperationStep[] = [
  { 
    id: 'cve-1', 
    type: OperationType.GATHER, 
    name: '数据获取', 
    description: '从 Git 仓库和 NVD 数据库拉取原始数据',
    content: `import requests
import git
import os

def fetch_kernel_source(repo_url="https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git"):
    if not os.path.exists("./linux-kernel"):
        git.Repo.clone_from(repo_url, "./linux-kernel")
    
    # 获取最新的commit logs
    repo = git.Repo("./linux-kernel")
    commits = list(repo.iter_commits('master', max_count=5000))
    return [{"hash": c.hexsha, "message": c.message, "date": c.committed_datetime} for c in commits]

raw_data = fetch_kernel_source()`, 
    status: 'completed', 
    progress: 100 
  },
  { 
    id: 'cve-2', 
    type: OperationType.MAP, 
    name: '数据格式清洗', 
    description: '清洗 Commit Message 并提取 CVE 引用',
    content: `import re

def clean_commit_message(commit_data):
    msg = commit_data['message']
    # 移除 Signed-off-by 等元数据行
    msg = re.sub(r'Signed-off-by:.*', '', msg, flags=re.MULTILINE)
    msg = re.sub(r'Reviewed-by:.*', '', msg, flags=re.MULTILINE)
    msg = re.sub(r'Cc:.*', '', msg, flags=re.MULTILINE)
    
    # 提取潜在的CVE引用
    cve_refs = re.findall(r'CVE-\d{4}-\d{4,7}', msg)
    
    return {
        "hash": commit_data['hash'],
        "clean_msg": msg.strip(),
        "cve_refs": cve_refs,
        "is_fix": "fix" in msg.lower()
    }

cleaned_data = [clean_commit_message(item) for item in raw_data]`, 
    status: 'completed', 
    progress: 100 
  },
  { 
    id: 'cve-3', 
    type: OperationType.SPLIT, 
    name: '数据采样', 
    description: '根据是否包含修复关键词进行分层采样',
    content: `import random

def sample_commits(data, sample_size=200, positive_ratio=0.5):
    # 分离包含 'fix' 关键字的提交和普通提交
    fixes = [d for d in data if d['is_fix']]
    others = [d for d in data if not d['is_fix']]
    
    n_fixes = int(sample_size * positive_ratio)
    n_others = sample_size - n_fixes
    
    sampled = random.sample(fixes, min(len(fixes), n_fixes)) + \\
              random.sample(others, min(len(others), n_others))
    
    random.shuffle(sampled)
    return sampled

sampled_batch = sample_commits(cleaned_data)`, 
    status: 'running', 
    progress: 45 
  },
  { 
    id: 'cve-4', 
    type: OperationType.GENERATE, 
    name: 'LLM蒸馏', 
    description: '使用 LLM 分析 Commit 是否为安全补丁',
    content: `from langchain.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate

llm = ChatOpenAI(model="gpt-4-turbo", temperature=0)

template = """
分析以下Linux内核提交信息，判断其是否修复了安全漏洞。
如果是，请提取漏洞类型、影响组件和修复逻辑摘要。

提交信息:
{commit_msg}

输出格式(JSON):
{{
  "is_security_patch": boolean,
  "vulnerability_type": string,
  "component": string,
  "fix_summary": string
}}
"""

prompt = PromptTemplate(template=template, input_variables=["commit_msg"])

results = []
for commit in sampled_batch:
    response = llm.predict(prompt.format(commit_msg=commit['clean_msg']))
    results.append({"hash": commit['hash'], "analysis": response})`, 
    status: 'idle', 
    progress: 0 
  },
];

// Pipeline 2: Data Quality Assessment
const dataQualitySteps: OperationStep[] = [
  { 
    id: 'dq-1', 
    type: OperationType.GATHER, 
    name: '数据获取', 
    description: '连接 CRM 数据库读取用户交互表',
    content: `import pandas as pd
import sqlalchemy

def load_data_source(connection_str, table_name):
    engine = sqlalchemy.create_engine(connection_str)
    # 读取原始业务数据
    df = pd.read_sql(f"SELECT * FROM {table_name} LIMIT 10000", engine)
    return df

raw_df = load_data_source("postgresql://user:pass@db:5432/crm", "customer_interactions")`, 
    status: 'completed', 
    progress: 100 
  },
  { 
    id: 'dq-2', 
    type: OperationType.MAP, 
    name: '数据格式整理', 
    description: '标准化时间格式和文本字段',
    content: `def standardize_format(df):
    # 统一日期格式
    if 'created_at' in df.columns:
        df['created_at'] = pd.to_datetime(df['created_at'])
    
    # 处理缺失值
    df['email'] = df['email'].fillna('unknown')
    
    # 规范化文本字段
    text_cols = ['comments', 'notes']
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower()
            
    return df

formatted_df = standardize_format(raw_df)`, 
    status: 'running', 
    progress: 20 
  },
  { 
    id: 'dq-3', 
    type: OperationType.GENERATE, 
    name: '评估Agent构建', 
    description: '构建基于规则的质量评估 Agent',
    content: `class QualityAssessmentAgent:
    def __init__(self, rules_config):
        self.rules = rules_config
    
    def assess_completeness(self, row):
        # 检查关键字段完整性
        score = 0
        for field in self.rules['critical_fields']:
            if row.get(field) and row.get(field) != 'unknown':
                score += 1
        return score / len(self.rules['critical_fields'])

    def assess_validity(self, row):
        # 逻辑一致性检查 (例如: 结束时间 > 开始时间)
        if row['end_time'] < row['start_time']:
            return 0
        return 1

agent = QualityAssessmentAgent({
    'critical_fields': ['user_id', 'transaction_amt', 'device_id']
})`, 
    status: 'idle', 
    progress: 0 
  },
  { 
    id: 'dq-4', 
    type: OperationType.REDUCE, 
    name: '数据评级', 
    description: '计算完整性和一致性得分并评级',
    content: `def rate_dataset(df, agent):
    ratings = []
    for _, row in df.iterrows():
        completeness = agent.assess_completeness(row)
        validity = agent.assess_validity(row)
        
        # 计算综合得分
        final_score = (completeness * 0.6) + (validity * 0.4)
        
        grade = 'C'
        if final_score > 0.9: grade = 'A'
        elif final_score > 0.7: grade = 'B'
        
        ratings.append(grade)
    
    df['quality_grade'] = ratings
    return df['quality_grade'].value_counts()

report = rate_dataset(formatted_df, agent)`, 
    status: 'idle', 
    progress: 0 
  },
];

export const mockPipelines: Pipeline[] = [
  {
    id: 'p-1',
    name: 'Linux kernel CVE蒸馏',
    description: '从Linux内核提交历史中提取并分析安全漏洞修复模式。',
    status: 'active',
    lastRun: '5分钟前',
    dataSources: [
      { id: 'ds-cve-1', name: 'linux_kernel_git', type: 'text', recordCount: 1250000, size: '3.5 GB' },
      { id: 'ds-cve-2', name: 'nvd_feed_2024', type: 'json', recordCount: 15000, size: '450 MB' }
    ],
    steps: cveDistillationSteps
  },
  {
    id: 'p-2',
    name: '数据质量评估',
    description: '通过自定义Agent对企业CRM数据进行多维度质量评分。',
    status: 'active',
    lastRun: '2小时前',
    dataSources: [
      { id: 'ds-dq-1', name: 'crm_interactions_raw', type: 'sql', recordCount: 500000, size: '8.2 GB' }
    ],
    steps: dataQualitySteps
  },
  {
    id: 'p-3',
    name: '专家CoT泛化',
    description: '基于专家推理轨迹的思维链（Chain-of-Thought）泛化模型训练。',
    status: 'draft',
    dataSources: [
      { id: 'ds-cot-1', name: 'expert_reasoning_traces', type: 'json', recordCount: 5000, size: '120 MB' }
    ],
    steps: [] // 节点内容为空
  }
];