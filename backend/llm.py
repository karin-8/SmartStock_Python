
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from dotenv import load_dotenv
import os
from datetime import datetime

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

llm = ChatOpenAI(openai_api_key=api_key, model="gpt-4o", temperature=0.4)

def summarize_analytics(analytics: dict) -> str:
    start = datetime.now()
    # return "Dummy"
    prompt = ChatPromptTemplate.from_template("""
        คุณคือนักวิเคราะห์คลังสินค้ามืออาชีพ นำข้อมูลที่ได้รับมาสรุปในรูปแบบที่อ่านเข้าใจง่าย เน้นย้ำเรื่องที่สำคัญ และแนะนำแนวทางดำเนินการต่อไป:

        Demand Spike:
        {demand_spike}

        Low Stock Trends:
        {low_stock_trend}

        🎯 **คำสั่ง**:
        - สรุปให้สั้นแต่ได้ใจความ
        - ให้ insight ที่เป็นประโยชน์กับคนหน้างาน (ที่ไม่มีความรู้สถิติ)
        - ตอบกลับในรูปแบบ **Markdown** โดยมี 3 หัวข้อ:

        
        ## สินค้ามาแรง
        - แสดงรายการ SKU ที่มี slope ความต้องการสูงสุด 5 รายการ

        ## สินค้าที่ต้องระวัง
        - แสดงรายการ SKU ที่มี slope สต็อกต่ำลงเร็วที่สุด 5 รายการ

        ## คำแนะนำเชิงกลยุทธ์
        - หลีกเลี่ยงคำแนะนำทั่วไป เช่น "ควรสั่งเพิ่ม" หรือ "ควรตรวจสอบ"
        - ให้คำแนะนำที่เฉพาะเจาะจงตามข้อมูล เช่น:
            - SKU ไหนควรเร่งเติม
            - สินค้าใดควรกระจายจากสาขา A ไป B
            - การปรับแผนจัดเก็บหรือปรับระดับ reorder point
        
        """)



    messages = prompt.format_messages(**analytics)
    response = llm.invoke(messages)

    end = datetime.now()

    elapsed = end - start

    print(f"Delivered AI insights: {elapsed.total_seconds():.2f} seconds elapsed.")
    return response.content
