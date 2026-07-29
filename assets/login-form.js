import { signIn, getSession } from "./auth.js";

/*
========================================
 로그인 시도 방지 보안 모듈
 Brute Force Attack Protection
========================================
*/

const MAX_LOGIN_ATTEMPTS = 5; 
// 허용 로그인 실패 횟수

const LOCK_TIME = 5 * 60 * 1000;
// 차단 시간 (5분)


function getLoginSecurityKey(email) {

  return `login_security_${email}`;

}



/*
 로그인 실패 기록 가져오기
*/
function getLoginFailData(email) {

  const key = getLoginSecurityKey(email);

  const savedData = localStorage.getItem(key);


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
      "로그인 보안 데이터 오류",
      error
    );


    return {
      attempts: 0,
      lockedUntil: 0
    };

  }

}



/*
 로그인 실패 기록 저장
*/
function saveLoginFailData(email,data){

  const key =
  getLoginSecurityKey(email);


  localStorage.setItem(
    key,
    JSON.stringify(data)
  );

}



/*
 로그인 실패 기록 초기화
*/
function resetLoginFailData(email){

  const key =
  getLoginSecurityKey(email);


  localStorage.removeItem(key);

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
 로그인 실패 처리
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

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  if (!form) return;

  const session = await getSession();
  if (session) {
    window.location.href = "index.html";
    return;
  }

  const statusEl = document.getElementById("login-status");
  const submitBtn = document.getElementById("login-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;

   /*
========================================
 로그인 차단 상태 확인
========================================
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
    submitBtn.textContent = "로그인 중...";
    statusEl.textContent = "";
    statusEl.className = "";

    try {
      const { error } = await signIn(email, password);
      if (error) throw error;

      statusEl.textContent = "로그인되었습니다. 이동 중...";
      statusEl.className = "contact-status-success";
      window.location.href = "index.html";
    } catch (err) {
      statusEl.textContent = "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
      statusEl.className = "contact-status-error";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "로그인";
    }
  });
});
