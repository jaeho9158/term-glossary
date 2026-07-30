import { supabase } from "./auth.js";
import { validateUserInput } from "./security.js";


/*
========================================
 문의 페이지 보안 처리
 - XSS 방지
 - 비정상 입력 차단
 - 입력값 검증
========================================
*/


document.addEventListener("DOMContentLoaded", () => {


  const form = document.getElementById("contact-form");

  if (!form) return;



  const statusEl =
    document.getElementById("contact-status");


  const submitBtn =
    document.getElementById("contact-submit-btn");




  form.addEventListener("submit", async (e) => {


    e.preventDefault();



    const name =
      document
      .getElementById("contact-name")
      .value
      .trim();



    const email =
      document
      .getElementById("contact-email")
      .value
      .trim();



    const message =
      document
      .getElementById("contact-message")
      .value
      .trim();





    if (!message) {

      statusEl.textContent =
        "문의 내용을 입력해 주세요.";

      statusEl.className =
        "contact-status-error";

      return;

    }







    /*
    ========================================
     입력값 보안 검사
    ========================================
    */


    const nameCheck =
      validateUserInput(name);



    const emailCheck =
      validateUserInput(email);



    const messageCheck =
      validateUserInput(message);







    if (!nameCheck.safe) {


      statusEl.textContent =
        nameCheck.reason;


      statusEl.className =
        "contact-status-error";


      return;

    }






    if (!emailCheck.safe) {


      statusEl.textContent =
        emailCheck.reason;


      statusEl.className =
        "contact-status-error";


      return;

    }







    if (!messageCheck.safe) {


      statusEl.textContent =
        messageCheck.reason;


      statusEl.className =
        "contact-status-error";


      return;

    }







    /*
    ========================================
     전송 준비
    ========================================
    */


    submitBtn.disabled = true;

    submitBtn.textContent =
      "보내는 중...";


    statusEl.textContent =
      "";

    statusEl.className =
      "";







    try {



      const { error } =

        await supabase
        .from("tg_contact_messages")
        .insert({

          /*
          검사 완료된 데이터 저장
          */

          name:
            nameCheck.value || null,


          email:
            emailCheck.value || null,


          message:
            messageCheck.value,


        });






      if (error) throw error;






      form.reset();



      statusEl.textContent =
        "문의가 접수되었습니다. 감사합니다!";



      statusEl.className =
        "contact-status-success";





    } catch (err) {



      console.error(
        "[CONTACT ERROR]",
        err
      );



      statusEl.textContent =
        "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";



      statusEl.className =
        "contact-status-error";



    } finally {



      submitBtn.disabled =
        false;



      submitBtn.textContent =
        "보내기";


    }



  });


});
