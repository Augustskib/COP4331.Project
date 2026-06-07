document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("pane-login");
    const alertBox = document.getElementById("login-alert");

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const usernameInput = document.getElementById("login-username").value;
        const passwordInput = document.getElementById("login-password").value;

        const userData = {
            login: usernameInput,
            password: passwordInput
        };

        try {
            
            const response = await fetch("http://contactmanager7.xyz/LAMPAPI/Login.php", {
                method: "POST", 
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData) 
            });

            const result = await response.json();
            
            // If error is found
            if (result.error !== "") {
                console.error("Login Failed:", result.error);
                alertBox.textContent = "Invalid username or password.";
                alertBox.className = "alert error";
                alertBox.style.display = "block";
            } else {
                console.log("Logged in successfully! User ID:", result.id);
                
                alertBox.textContent = "Logging in...";
                alertBox.className = "alert success";
                alertBox.style.display = "block";

                //Save the User ID to localStorage
                localStorage.setItem("userId", result.id);
                //Save the name too, so the dashboard can show who is logged in
                localStorage.setItem("firstName", result.firstName);
                localStorage.setItem("lastName", result.lastName);

                //redirect to dashboard
                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 1000);
            }

        } catch (error) {
            console.error("The fetch failed entirely:", error);
            alertBox.textContent = "Could not connect to the server.";
            alertBox.className = "alert error";
            alertBox.style.display = "block";
        }
    })
})