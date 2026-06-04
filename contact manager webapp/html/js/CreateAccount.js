document.addEventListener("DOMContentLoaded", () => {
    const registerForm = document.getElementById("pane-register");
    const alertBox = document.getElementById("register-alert");

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const firstnameInput = document.getElementById("reg-firstname").value;
        const lastnameInput = document.getElementById("reg-lastname").value;
        const usernameInput = document.getElementById("reg-username").value;
        const passwordInput = document.getElementById("reg-password").value;

        // FIXED: Keys exactly match the Swagger document
        const userData = {
            firstName: firstnameInput,
            lastName: lastnameInput,
            login: usernameInput,
            password: passwordInput
        };

        // UI Update: Show a loading message to the user
        alertBox.textContent = "Creating account...";
        alertBox.className = "alert"; // Reset to default alert class
        alertBox.style.display = "block"; // Make the box visible

        try {
            const response = await fetch("http://contactmanager7.xyz/LAMPAPI/Registration.php", {
                method: "POST", 
                headers: {
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify(userData) 
            });

            const result = await response.json();

            // Check if there is an error message from the backend
            if (result.error !== "") {
                // UI Update: Show the specific error to the user in red
                alertBox.textContent = result.error;
                alertBox.className = "alert error"; 
            } else {
                // UI Update: Show success message in green
                alertBox.textContent = "Account created successfully! Redirecting...";
                alertBox.className = "alert success";

                // The Redirect: Wait 2 seconds, then send them to the login page
                setTimeout(() => {
                    window.location.href = "index.html";
                }, 2000);
            }

        } catch (error) {
            // UI Update: Show a network failure message in red
            alertBox.textContent = "Could not connect to the server. Please try again.";
            alertBox.className = "alert error";
            console.error("The fetch failed entirely:", error);
        }
    });
});