import { signIn, getSession } from "./auth.js";


/*
========================================
 로그인 시도 방지 보안 모듈
 Brute Force Attack Protection
========================================
*/


const MAX_LOGIN_ATTEMPTS = 5;
// 최대 로그인 실패 허용 횟수


const LOCK_TIME = 5 * 60 * 1000;
// 잠금 시간 (5분)





/*
 로그인 보안 데이터 저장 키 생성
*/
function getLoginSecurityKey(email) {

  return `login_security_${email}`;

}





/*
 로그인 실패 데이터 가져오기
*/
function getLoginFailData(email) {


  const key =
  getLoginSecurityKey(email);



  let savedData = null;

  try {

    savedData = localStorage.getItem(key);

  }

  catch(e){ /* 읽기 실패는 '기록 없음'으로 취급 */ }



  if(!savedData){


    return {

      attempts: 0,

      lockedUntil: 0

    };

  }




  try {


    return JSON.parse(savedData);



  }

  catch(error){


    console.error(
      "[SECURITY] 로그인 데이터 오류",
      error
    );


    return {

      attempts: 0,

      lockedUntil: 0

    };


  }


}







/*
 로그인 실패 데이터 저장
*/
function saveLoginFailData(email,data){


  const key =
  getLoginSecurityKey(email);



  // 프라이빗 모드·쿼터 초과에서 setItem이 throw하면 로그인 실패 처리
  // 경로(catch 블록) 자체가 죽어 오류 안내조차 뜨지 않는다 — 조용히 넘긴다.
  try {

    localStorage.setItem(

      key,

      JSON.stringify(data)

    );

  }

  catch(e){ /* 저장 실패는 무시 */ }


}



















/*
 로그인 성공 시 실패 기록 삭제
*/
function resetLoginFailData(email){


  const key =
  getLoginSecurityKey(email);



  try {

    localStorage.removeItem(key);

  }

  catch(e){ /* 삭제 실패는 무시 */ }


}








/*
 현재 로그인 차단 여부 확인
*/
function checkLoginBlocked(email){


  const data =
  getLoginFailData(email);



  if(data.lockedUntil === 0){


    return false;


  }





  if(Date.now() >= data.lockedUntil){


    resetLoginFailData(email);


    return false;


  }





  return true;


}








/*
 남은 차단 시간 계산
*/
function getLoginBlockRemaining(email){


  const data =
  getLoginFailData(email);



  const remaining =
  data.lockedUntil - Date.now();



  if(remaining <= 0){


    return 0;


  }



  return Math.ceil(
    remaining / 1000
  );


}








/*
 로그인 실패 기록
*/
function recordLoginFailure(email){



  let data =
  getLoginFailData(email);



  data.attempts += 1;




  console.warn(
    "[SECURITY] 로그인 실패:",
    email
  );



  console.warn(
    "[SECURITY] 실패 횟수:",
    data.attempts
  );







  if(data.attempts >= MAX_LOGIN_ATTEMPTS){



    data.lockedUntil =
    Date.now() + LOCK_TIME;



    console.warn(
      "[SECURITY] 로그인 임시 차단 활성화"
    );


  }






  saveLoginFailData(

    email,

    data

  );



  return data;


}









document.addEventListener(
"DOMContentLoaded",
async () => {



  const form =
  document.getElementById(
    "login-form"
  );



  if(!form) return;





  const session =
  await getSession();



  if(session){


    window.location.href =
    "index.html";


    return;


  }






  const statusEl =
  document.getElementById(
    "login-status"
  );



  const submitBtn =
  document.getElementById(
    "login-submit-btn"
  );








  form.addEventListener(
  "submit",
  async (e)=> {



    e.preventDefault();






    const email =
    document
    .getElementById(
      "login-email"
    )
    .value
    .trim();





    const password =
    document
    .getElementById(
      "login-password"
    )
    .value;






    if(!email || !password){

      return;

    }







    /*
    ================================
     로그인 잠금 확인
    ================================
    */


    if(checkLoginBlocked(email)){



      const remain =
      getLoginBlockRemaining(email);




      statusEl.textContent =
      `보안을 위해 로그인이 제한되었습니다. ${remain}초 후 다시 시도해주세요.`;



      statusEl.className =
      "contact-status-error";



      return;


    }








    submitBtn.disabled = true;

    submitBtn.textContent =
    "로그인 중...";



    statusEl.textContent = "";

    statusEl.className = "";








    try {



      const { error } =
      await signIn(
        email,
        password
      );



      if(error){

        throw error;

      }








      /*
      로그인 성공
      실패 기록 초기화
      */


      resetLoginFailData(email);





      statusEl.textContent =
      "로그인되었습니다. 이동 중...";



      statusEl.className =
      "contact-status-success";



      window.location.href =
      "index.html";







    }

    catch(err){





      const failData =
      recordLoginFailure(email);







      if(
        failData.attempts >= MAX_LOGIN_ATTEMPTS
      ){



        statusEl.textContent =
        "로그인 실패가 반복되어 5분간 로그인이 제한됩니다.";



      }

      else {



        statusEl.textContent =
        `로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요. (${failData.attempts}/${MAX_LOGIN_ATTEMPTS})`;



      }






      statusEl.className =
      "contact-status-error";



    }







    finally {



      submitBtn.disabled = false;


      submitBtn.textContent =
      "로그인";



    }





  });



});
