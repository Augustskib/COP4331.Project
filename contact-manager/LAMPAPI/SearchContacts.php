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
                $search = $inData["search"];
                $page = isset($inData["page"]) ? (int)$inData["page"] : 1;
                $limit = 20;
                $offset = ($page - 1) * $limit;
                $conditions = ["UserID=?"];
                $params = [$inData["userId"]];
                $types = "i";
                if (!empty($search["firstName"])) {
                        $conditions[] = "FirstName LIKE ?";
                        $params[] = "%" . $search["firstName"] . "%";
                        $types .= "s";
                }
                if (!empty($search["lastName"])) {
                        $conditions[] = "LastName LIKE ?";
                        $params[] = "%" . $search["lastName"] . "%";
                        $types .= "s";
                }
                if (!empty($search["email"])) {
                        $conditions[] = "Email LIKE ?";
                        $params[] = "%" . $search["email"] . "%";
                        $types .= "s";
                }
                if (!empty($search["phone"])) {
                        $conditions[] = "Phone LIKE ?";
                        $params[] = "%" . $search["phone"] . "%";
                        $types .= "s";
                }
                $sql = "SELECT ID,FirstName,LastName,Email,Phone FROM Contacts WHERE " . implode(" AND ", $conditions) . " LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;
                $types .= "ii";
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $result = $stmt->get_result();
                $contacts = array();
                while ($row = $result->fetch_assoc())
                {
                        $contacts[] = array(
                                "id" => $row["ID"],
                                "firstName" => $row["FirstName"],
                                "lastName" => $row["LastName"],
                                "email" => $row["Email"],
                                "phone" => $row["Phone"]
                        );
                }
                if (count($contacts) > 0)
                {
                        returnWithInfo($contacts);
                }
                else
                {
                        returnWithError("No Records Found");
                }
                $stmt->close();
                $conn->close();
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
        function returnWithInfo($contacts)
        {
                $retValue = '{"results":' . json_encode($contacts) . ',"error":""}';
                sendResultInfoAsJson($retValue);
        }
?>