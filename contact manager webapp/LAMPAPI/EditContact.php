<?php
        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                http_response_code(200);
                exit();
        }
        $inData = getRequestInfo();
        $conn = new mysqli("localhost", "TheBeast", "WeLoveCOP4331", "ContactManager");
        if ($conn->connect_error)
        {
                returnWithError($conn->connect_error);
        }
        else
        {
                if (!preg_match('/^\d{3}-\d{3}-\d{4}$/', $inData["phone"]))
                {
                        returnWithError("Invalid phone number format. Use ###-###-####");
                }
                else
                {
                        $stmt = $conn->prepare("UPDATE Contacts SET FirstName=?, LastName=?, Email=?, Phone=? WHERE ID=? AND UserID=?");
                        $stmt->bind_param("ssssii", $inData["firstName"], $inData["lastName"], $inData["email"], $inData["phone"], $inData["contactId"], $inData["userId"]);
                        $stmt->execute();
                        if ($stmt->affected_rows > 0)
                        {
                                returnWithError("");
                        }
                        else
                        {
                                returnWithError("Contact not found or unauthorized");
                        }
                        $stmt->close();
                        $conn->close();
                }
        }
        function getRequestInfo()
        {
                return json_decode(file_get_contents('php://input'), true);
        }
        function sendResultInfoAsJson($obj)
        {
                header('Content-type: application/json');
                echo $obj;
        }
        function returnWithError($err)
        {
                $retValue = '{"error":"' . $err . '"}';
                sendResultInfoAsJson($retValue);
        }
?>
